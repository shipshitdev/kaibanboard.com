/**
 * Cursor Cloud Adapter
 * Integration with Cursor's Cloud Agent API for full agent workflows
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import type {
  AgentResponse,
  AIProviderAdapter,
  ModelInfo,
  ProviderType,
  SendTaskOptions,
  TaskPrompt,
} from "../types/aiProvider";

const execAsync = promisify(exec);

export class CursorCloudAdapter implements AIProviderAdapter {
  readonly type: ProviderType = "cursor";
  readonly displayName = "Cursor Cloud Agent";
  readonly supportsStreaming = false;
  readonly supportsAgentMode = true;

  private static readonly API_BASE_URL = "https://api.cursor.com/v0";

  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  async validateApiKey(apiKey: string): Promise<boolean> {
    if (!apiKey || apiKey.length < 20) {
      return false;
    }

    // Cursor doesn't have a simple validation endpoint, so we just check format
    return true;
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    // Cursor Cloud Agent uses its own model selection internally
    return [
      {
        id: "cursor-agent",
        name: "Cursor Cloud Agent",
        provider: "cursor",
        contextWindow: 200000,
        inputPrice: 0, // Pricing is per-agent, not per-token
        outputPrice: 0,
        supportsTools: true,
        supportsStreaming: false,
      },
    ];
  }

  async sendTask(prompt: TaskPrompt, options: SendTaskOptions): Promise<AgentResponse> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return {
        id: "",
        status: "error",
        provider: this.type,
        error: "Cursor API key not configured",
      };
    }

    const composedPrompt = this.composePrompt(prompt);
    const branchName = this.generateBranchName(prompt.title);

    try {
      // Basic auth with API key as username
      const authHeader = Buffer.from(`${apiKey}:`).toString("base64");

      const requestBody: Record<string, unknown> = {
        prompt: { text: composedPrompt },
        source: {
          repository: await this.getRepositoryUrl(),
          ref: "main", // Default to main branch
        },
      };

      // Add target options if PR creation is enabled
      if (options.createPR !== false) {
        requestBody.target = {
          autoCreatePr: options.createPR ?? true,
          branchName,
        };
      }

      const response = await fetch(`${CursorCloudAdapter.API_BASE_URL}/agents`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          id: "",
          status: "error",
          provider: this.type,
          error: `Cursor API error (${response.status}): ${errorText}`,
        };
      }

      const data = (await response.json()) as {
        id: string;
        name: string;
        status: string;
        target?: { branchName: string; prUrl?: string };
      };

      return {
        id: data.id,
        status: this.mapStatus(data.status),
        provider: this.type,
        branchName: data.target?.branchName || branchName,
        prUrl: data.target?.prUrl,
      };
    } catch (error) {
      return {
        id: "",
        status: "error",
        provider: this.type,
        error: `Request failed: ${error}`,
      };
    }
  }

  async checkStatus(agentId: string): Promise<AgentResponse> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return {
        id: agentId,
        status: "error",
        provider: this.type,
        error: "Cursor API key not configured",
      };
    }

    try {
      const authHeader = Buffer.from(`${apiKey}:`).toString("base64");

      const response = await fetch(`${CursorCloudAdapter.API_BASE_URL}/agents/${agentId}`, {
        headers: {
          Authorization: `Basic ${authHeader}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          id: agentId,
          status: "error",
          provider: this.type,
          error: `Cursor API error (${response.status}): ${errorText}`,
        };
      }

      const data = (await response.json()) as {
        id: string;
        status: string;
        target?: { branchName: string; prUrl?: string };
        summary?: string;
      };

      return {
        id: data.id,
        status: this.mapStatus(data.status),
        provider: this.type,
        branchName: data.target?.branchName,
        prUrl: data.target?.prUrl,
        output: data.summary,
      };
    } catch (error) {
      return {
        id: agentId,
        status: "error",
        provider: this.type,
        error: `Status check failed: ${error}`,
      };
    }
  }

  async cancelTask(agentId: string): Promise<void> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error("Cursor API key not configured");
    }

    const authHeader = Buffer.from(`${apiKey}:`).toString("base64");

    const response = await fetch(`${CursorCloudAdapter.API_BASE_URL}/agents/${agentId}/stop`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to cancel agent: ${errorText}`);
    }
  }

  private mapStatus(cursorStatus: string): AgentResponse["status"] {
    switch (cursorStatus.toUpperCase()) {
      case "CREATING":
      case "RUNNING":
        return "running";
      case "FINISHED":
        return "completed";
      case "ERROR":
        return "error";
      default:
        return "pending";
    }
  }

  private generateBranchName(title: string): string {
    const sanitized = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 40);

    const timestamp = Date.now().toString(36);
    return `cursor-agent/${sanitized}-${timestamp}`;
  }

  private async getRepositoryUrl(): Promise<string> {
    // 1. First check VS Code settings
    const config = vscode.workspace.getConfiguration("kaiban.cursor");
    const configuredUrl = config.get<string>("repositoryUrl", "");
    if (configuredUrl && configuredUrl.trim().length > 0) {
      return configuredUrl.trim();
    }

    // 2. Try to auto-detect from git remote
    const detectedUrl = await this.detectGitRepositoryUrl();
    if (detectedUrl) {
      return detectedUrl;
    }

    // 3. Fallback to placeholder
    return "https://github.com/user/repo";
  }

  private async detectGitRepositoryUrl(): Promise<string | null> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
      }

      // Try VS Code Git extension API first
      try {
        const gitExtension = vscode.extensions.getExtension("vscode.git");
        if (gitExtension?.isActive) {
          const git = gitExtension.exports.getAPI(1);
          if (git) {
            for (const folder of workspaceFolders) {
              const repository = git.getRepository(folder.uri);
              if (repository) {
                const remotes = repository.state.remotes;
                const origin = remotes.find((r: { name: string }) => r.name === "origin");
                if (origin?.fetchUrl) {
                  return this.normalizeGitUrl(origin.fetchUrl);
                }
              }
            }
          }
        }
      } catch {
        // Git extension not available or not active, continue to fallback
      }

      // Fallback: Execute git command
      for (const folder of workspaceFolders) {
        try {
          const { stdout } = await execAsync("git config --get remote.origin.url", {
            cwd: folder.uri.fsPath,
          });
          const url = stdout.trim();
          if (url) {
            return this.normalizeGitUrl(url);
          }
        } catch {
          // Git command failed, try next folder
        }
      }
    } catch {
      // Detection failed
    }

    return null;
  }

  private normalizeGitUrl(url: string): string {
    // Convert SSH URLs to HTTPS
    // git@github.com:user/repo.git -> https://github.com/user/repo
    // git@github.com:user/repo -> https://github.com/user/repo
    if (url.startsWith("git@")) {
      url = url.replace("git@", "https://").replace(":", "/");
    }

    // Remove .git suffix if present
    url = url.replace(/\.git$/, "");

    // Ensure it's a valid URL
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }

    return url;
  }

  private composePrompt(task: TaskPrompt): string {
    const parts: string[] = [];

    parts.push(`# Task: ${task.title}`);
    parts.push("");
    parts.push(`**Type:** ${task.type}`);
    parts.push(`**Priority:** ${task.priority}`);
    parts.push("");

    if (task.description) {
      parts.push("## Description");
      parts.push(task.description);
      parts.push("");
    }

    if (task.rejectionHistory) {
      parts.push("## Previous Feedback");
      parts.push("This task has been rejected previously. Please address the following feedback:");
      parts.push(task.rejectionHistory);
      parts.push("");
    }

    if (task.prdContent) {
      parts.push("## Product Requirements Document");
      parts.push(task.prdContent);
      parts.push("");
    }

    if (task.filePath) {
      parts.push("## Task File");
      parts.push(`Task is defined in: ${task.filePath}`);
      parts.push("");
    }

    parts.push("## Instructions");
    parts.push("1. Implement the task as described above");
    parts.push("2. Follow existing code patterns and conventions");
    parts.push("3. Add appropriate tests if applicable");
    parts.push("4. Update documentation if needed");
    parts.push("5. Create a clear commit message describing the changes");
    parts.push("6. Create a PR with a clear description of the changes");

    return parts.join("\n");
  }
}
