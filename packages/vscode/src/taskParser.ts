import * as fs from "node:fs";
import * as path from "node:path";
import type { GitHubMetadata, Task, TaskStatus, TaskWorktreeMetadata } from "@kaibanboard/core";
import { CoreTaskParser } from "@kaibanboard/core";
import * as vscode from "vscode";

// Re-export types from core for backward compatibility
export type {
  GitHubMetadata,
  Task,
  TaskPriority,
  TaskStatus,
  TaskWorktreeMetadata,
} from "@kaibanboard/core";

/**
 * VS Code adapter for CoreTaskParser
 * Provides VS Code-specific functionality on top of the core parser
 */
export class TaskParser extends CoreTaskParser {
  constructor() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const dirs = workspaceFolders
      ? workspaceFolders.map((f) => ({ path: f.uri.fsPath, name: f.name }))
      : [];

    const config = vscode.workspace.getConfiguration("kaiban.prd");
    const prdBasePath = config.get<string>("basePath", ".agent/PRDS");

    super(dirs, { prdBasePath });
  }

  /**
   * Write task file in structured format
   */
  public writeTask(task: Task): void {
    const orderLine = task.order !== undefined ? `**Order:** ${task.order}\n` : "";
    const content = `## Task: ${task.label}

**ID:** ${task.id}
**Label:** ${task.label}
**Description:** ${task.description}
**Type:** ${task.type}
**Status:** ${task.status}
**Priority:** ${task.priority}
${orderLine}**Created:** ${task.created}
**Updated:** ${task.updated}
**PRD:** [Link](${task.prdPath})

---
`;

    fs.writeFileSync(task.filePath, content, "utf-8");
  }

  /**
   * Update task status by ID (async version with PRD update)
   */
  public async updateTaskStatusAsync(
    taskId: string,
    newStatus: TaskStatus,
    order?: number
  ): Promise<void> {
    // Call parent's sync method
    super.updateTaskStatus(taskId, newStatus, order);

    // Also update PRD file status if it exists
    const task = this.getTask(taskId);
    if (task?.prdPath) {
      await this.updatePRDStatus(task.filePath, task.prdPath, newStatus);
    }
  }

  /**
   * Update task fields by ID
   */
  public updateTask(
    taskId: string,
    updates: {
      label?: string;
      description?: string;
      priority?: string;
      type?: string;
      status?: string;
    }
  ): void {
    const task = this.getTask(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");
    const now = new Date().toISOString();

    const updatedLines = lines.map((line, index) => {
      if (index === 0 && updates.label !== undefined) {
        return `## Task: ${updates.label}`;
      } else if (line.startsWith("**Label:**") && updates.label !== undefined) {
        return `**Label:** ${updates.label}`;
      } else if (line.startsWith("**Description:**") && updates.description !== undefined) {
        return `**Description:** ${updates.description}`;
      } else if (line.startsWith("**Type:**") && updates.type !== undefined) {
        return `**Type:** ${updates.type}`;
      } else if (line.startsWith("**Status:**") && updates.status !== undefined) {
        return `**Status:** ${updates.status}`;
      } else if (line.startsWith("**Priority:**") && updates.priority !== undefined) {
        return `**Priority:** ${updates.priority}`;
      } else if (line.startsWith("**Updated:**")) {
        return `**Updated:** ${now}`;
      }
      return line;
    });

    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");

    if (updates.status && task.prdPath) {
      this.updatePRDStatus(task.filePath, task.prdPath, updates.status as TaskStatus);
    }
  }

  /**
   * Update task PRD path by ID
   */
  public updateTaskPRD(taskId: string, prdPath: string): void {
    const task = this.getTask(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");

    const now = new Date().toISOString();
    let prdLineExists = false;
    const updatedLines = lines.map((line) => {
      if (line.startsWith("**PRD:**")) {
        prdLineExists = true;
        return `**PRD:** [Link](${prdPath})`;
      } else if (line.startsWith("**Updated:**")) {
        return `**Updated:** ${now}`;
      }
      return line;
    });

    if (!prdLineExists) {
      const updatedIndex = updatedLines.findIndex((line) => line.startsWith("**Updated:**"));
      if (updatedIndex >= 0) {
        updatedLines.splice(updatedIndex + 1, 0, `**PRD:** [Link](${prdPath})`);
      }
    }

    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");
  }

  /**
   * Update PRD file status to sync with task status (VS Code-specific)
   */
  private updatePRDStatus(taskFilePath: string, prdPath: string, newStatus: TaskStatus): void {
    try {
      const taskDir = path.dirname(taskFilePath);
      let resolvedPrdPath: string;

      if (prdPath.startsWith("../") || prdPath.startsWith("./")) {
        resolvedPrdPath = path.resolve(taskDir, prdPath);
      } else if (path.isAbsolute(prdPath)) {
        resolvedPrdPath = prdPath;
      } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          resolvedPrdPath = path.resolve(
            workspaceFolders[0].uri.fsPath,
            this.getPrdBasePath(),
            prdPath
          );
        } else {
          resolvedPrdPath = path.resolve(taskDir, prdPath);
        }
      }

      if (!fs.existsSync(resolvedPrdPath)) {
        return;
      }

      const prdContent = fs.readFileSync(resolvedPrdPath, "utf-8");
      const prdLines = prdContent.split("\n");

      const hasStatusField = prdLines.some((line) => line.match(/^\*\*Status:\*\*/i));

      if (hasStatusField) {
        const updatedPrdLines = prdLines.map((line) => {
          if (line.match(/^\*\*Status:\*\*/i)) {
            return `**Status:** ${newStatus}`;
          }
          return line;
        });
        fs.writeFileSync(resolvedPrdPath, updatedPrdLines.join("\n"), "utf-8");
      } else {
        let insertIndex = 1;
        for (let i = 0; i < prdLines.length; i++) {
          if (prdLines[i].startsWith("#")) {
            insertIndex = i + 1;
            break;
          }
        }

        const updatedPrdLines = [
          ...prdLines.slice(0, insertIndex),
          "",
          `**Status:** ${newStatus}`,
          ...prdLines.slice(insertIndex),
        ];
        fs.writeFileSync(resolvedPrdPath, updatedPrdLines.join("\n"), "utf-8");
      }
    } catch (error) {
      console.warn(`Failed to update PRD status: ${error}`);
    }
  }

  /**
   * Reject a task - move back to To Do with rejection note
   */
  public rejectTask(taskId: string, note: string): void {
    const task = this.getTask(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");

    const now = new Date().toISOString();
    const newRejectionCount = task.rejectionCount + 1;
    let rejectionAdded = false;

    const updatedLines = lines.map((line) => {
      if (line.startsWith("**Status:**")) {
        return "**Status:** To Do";
      } else if (line.startsWith("**Updated:**")) {
        return `**Updated:** ${now}`;
      } else if (line.startsWith("**Claimed-By:**")) {
        return "**Claimed-By:**";
      } else if (line.startsWith("**Claimed-At:**")) {
        return "**Claimed-At:**";
      } else if (line.startsWith("**Completed-At:**")) {
        return "**Completed-At:**";
      } else if (line.startsWith("**Rejection-Count:**")) {
        return `**Rejection-Count:** ${newRejectionCount}`;
      } else if (line.startsWith("**Rejections:**") && !rejectionAdded) {
        rejectionAdded = true;
        return `**Rejections:**\n- ${now.split("T")[0]}: ${note}`;
      }
      return line;
    });

    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");
  }

  /**
   * Update worktree metadata for a task
   */
  public updateTaskWorktree(taskId: string, worktree: TaskWorktreeMetadata): void {
    const task = this.getTask(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");
    const now = new Date().toISOString();

    // Track which fields exist
    const existingFields = new Set<string>();
    for (const line of lines) {
      if (line.startsWith("**Worktree-Enabled:**")) existingFields.add("enabled");
      if (line.startsWith("**Worktree-Path:**")) existingFields.add("path");
      if (line.startsWith("**Worktree-Branch:**")) existingFields.add("branch");
      if (line.startsWith("**Worktree-Base-Branch:**")) existingFields.add("baseBranch");
      if (line.startsWith("**Worktree-Created-At:**")) existingFields.add("createdAt");
      if (line.startsWith("**Worktree-Status:**")) existingFields.add("status");
    }

    // Update existing lines
    const updatedLines = lines.map((line) => {
      if (line.startsWith("**Updated:**")) {
        return `**Updated:** ${now}`;
      } else if (line.startsWith("**Worktree-Enabled:**")) {
        return `**Worktree-Enabled:** ${worktree.worktreeEnabled}`;
      } else if (line.startsWith("**Worktree-Path:**") && worktree.worktreePath) {
        return `**Worktree-Path:** ${worktree.worktreePath}`;
      } else if (line.startsWith("**Worktree-Branch:**") && worktree.worktreeBranch) {
        return `**Worktree-Branch:** ${worktree.worktreeBranch}`;
      } else if (line.startsWith("**Worktree-Base-Branch:**") && worktree.worktreeBaseBranch) {
        return `**Worktree-Base-Branch:** ${worktree.worktreeBaseBranch}`;
      } else if (line.startsWith("**Worktree-Created-At:**") && worktree.worktreeCreatedAt) {
        return `**Worktree-Created-At:** ${worktree.worktreeCreatedAt}`;
      } else if (line.startsWith("**Worktree-Status:**") && worktree.worktreeStatus) {
        return `**Worktree-Status:** ${worktree.worktreeStatus}`;
      }
      return line;
    });

    // Add missing fields before the --- separator
    const separatorIndex = updatedLines.indexOf("---");
    const insertIndex = separatorIndex > 0 ? separatorIndex : updatedLines.length;

    const newLines: string[] = [];
    if (!existingFields.has("enabled")) {
      newLines.push(`**Worktree-Enabled:** ${worktree.worktreeEnabled}`);
    }
    if (!existingFields.has("path") && worktree.worktreePath) {
      newLines.push(`**Worktree-Path:** ${worktree.worktreePath}`);
    }
    if (!existingFields.has("branch") && worktree.worktreeBranch) {
      newLines.push(`**Worktree-Branch:** ${worktree.worktreeBranch}`);
    }
    if (!existingFields.has("baseBranch") && worktree.worktreeBaseBranch) {
      newLines.push(`**Worktree-Base-Branch:** ${worktree.worktreeBaseBranch}`);
    }
    if (!existingFields.has("createdAt") && worktree.worktreeCreatedAt) {
      newLines.push(`**Worktree-Created-At:** ${worktree.worktreeCreatedAt}`);
    }
    if (!existingFields.has("status") && worktree.worktreeStatus) {
      newLines.push(`**Worktree-Status:** ${worktree.worktreeStatus}`);
    }

    if (newLines.length > 0) {
      updatedLines.splice(insertIndex, 0, ...newLines);
    }

    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");
  }

  /**
   * Update GitHub metadata for a task
   */
  public updateTaskGitHub(taskId: string, github: GitHubMetadata): void {
    const task = this.getTask(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");
    const now = new Date().toISOString();

    // Track which fields exist
    const existingFields = new Set<string>();
    for (const line of lines) {
      if (line.startsWith("**GitHub:**")) existingFields.add("issue");
      if (line.startsWith("**GitHub-PR:**")) existingFields.add("pr");
      if (line.startsWith("**GitHub-Synced:**")) existingFields.add("synced");
    }

    // Update existing lines
    const updatedLines = lines.map((line) => {
      if (line.startsWith("**Updated:**")) {
        return `**Updated:** ${now}`;
      } else if (line.startsWith("**GitHub:**") && github.issueUrl) {
        return `**GitHub:** [Issue #${github.issueNumber || ""}](${github.issueUrl})`;
      } else if (line.startsWith("**GitHub-PR:**") && github.prUrl) {
        return `**GitHub-PR:** [PR #${github.prNumber || ""}](${github.prUrl})`;
      } else if (line.startsWith("**GitHub-Synced:**")) {
        return `**GitHub-Synced:** ${github.lastSynced || now}`;
      }
      return line;
    });

    // Add missing fields before the --- separator
    const separatorIndex = updatedLines.indexOf("---");
    const insertIndex = separatorIndex > 0 ? separatorIndex : updatedLines.length;

    const newLines: string[] = [];
    if (!existingFields.has("issue") && github.issueUrl) {
      newLines.push(`**GitHub:** [Issue #${github.issueNumber || ""}](${github.issueUrl})`);
    }
    if (!existingFields.has("pr") && github.prUrl) {
      newLines.push(`**GitHub-PR:** [PR #${github.prNumber || ""}](${github.prUrl})`);
    }
    if (!existingFields.has("synced")) {
      newLines.push(`**GitHub-Synced:** ${github.lastSynced || now}`);
    }

    if (newLines.length > 0) {
      updatedLines.splice(insertIndex, 0, ...newLines);
    }

    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");
  }

  /**
   * Clear worktree metadata from a task (after merge/cleanup)
   */
  public clearTaskWorktree(taskId: string): void {
    const task = this.getTask(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");
    const now = new Date().toISOString();

    // Remove worktree lines and update timestamp
    const updatedLines = lines
      .filter((line) => {
        return (
          !line.startsWith("**Worktree-Enabled:**") &&
          !line.startsWith("**Worktree-Path:**") &&
          !line.startsWith("**Worktree-Branch:**") &&
          !line.startsWith("**Worktree-Base-Branch:**") &&
          !line.startsWith("**Worktree-Created-At:**") &&
          !line.startsWith("**Worktree-Status:**")
        );
      })
      .map((line) => {
        if (line.startsWith("**Updated:**")) {
          return `**Updated:** ${now}`;
        }
        return line;
      });

    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");
  }
}
