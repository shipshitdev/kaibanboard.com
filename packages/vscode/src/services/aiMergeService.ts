/**
 * AI Merge Service
 * Resolves merge conflicts using Claude or Codex
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  AIConflictResolution,
  AIMergeResolutionResult,
  MergePromptContext,
  ParsedConflictFile,
} from "../types/merge";

const execAsync = promisify(exec);

/**
 * Service for AI-powered merge conflict resolution.
 * Uses Claude or Codex CLI to resolve conflicts.
 */
export class AIMergeService {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Build the prompt for AI merge resolution
   */
  buildMergePrompt(context: MergePromptContext): string {
    let prompt = `You are helping resolve merge conflicts for a task.

## Task Information
- **Task:** ${context.taskLabel}
- **Description:** ${context.taskDescription}
`;

    if (context.prdContent) {
      prompt += `
## PRD Context (abbreviated)
${context.prdContent.substring(0, 1500)}${context.prdContent.length > 1500 ? "..." : ""}
`;
    }

    prompt += `
## Merge Conflicts

The following files have conflicts that need to be resolved:

`;

    for (const file of context.conflicts) {
      prompt += `### File: ${file.filePath}\n\n`;

      for (let i = 0; i < file.conflicts.length; i++) {
        const conflict = file.conflicts[i];
        prompt += `#### Conflict ${i + 1} (lines ${conflict.startLine}-${conflict.endLine})\n\n`;
        prompt += `**Our version (current branch):**\n\`\`\`\n${conflict.ours}\n\`\`\`\n\n`;
        prompt += `**Their version (incoming branch):**\n\`\`\`\n${conflict.theirs}\n\`\`\`\n\n`;
      }
    }

    prompt += `
## Instructions

For each conflict:
1. Analyze both versions in the context of the task and PRD requirements
2. Determine the best resolution that preserves all intended functionality
3. If both versions have valid changes, merge them intelligently
4. Provide a confidence level (high/medium/low) and brief explanation

Respond with JSON in this format:
{
  "resolutions": [
    {
      "filePath": "path/to/file",
      "resolvedContent": "the merged code",
      "confidence": "high|medium|low",
      "explanation": "why this resolution was chosen",
      "needsReview": true|false
    }
  ],
  "summary": "brief summary of all resolutions"
}

Important:
- Preserve code formatting and indentation
- Don't add or remove functionality not present in either version
- Mark as needsReview=true if the resolution is complex or uncertain
`;

    return prompt;
  }

  /**
   * Resolve conflicts using Claude CLI
   */
  async resolveWithClaude(
    context: MergePromptContext,
    claudePath = "claude"
  ): Promise<AIMergeResolutionResult> {
    const prompt = this.buildMergePrompt(context);

    try {
      // Write prompt to temp file for complex prompts
      const tempPromptFile = `${this.workspacePath}/.kaiban-merge-prompt.txt`;
      const fs = await import("node:fs");
      fs.writeFileSync(tempPromptFile, prompt, "utf-8");

      const command = `cat "${tempPromptFile}" | ${claudePath} --print`;

      const { stdout } = await execAsync(command, {
        cwd: this.workspacePath,
        timeout: 120000, // 2 minutes for complex merges
        maxBuffer: 5 * 1024 * 1024, // 5MB
      });

      // Clean up temp file
      try {
        fs.unlinkSync(tempPromptFile);
      } catch {}

      return this.parseAIResponse(stdout, context.conflicts);
    } catch (error) {
      return {
        success: false,
        resolutions: [],
        summary: "",
        totalConflicts: context.conflicts.reduce((sum, f) => sum + f.conflicts.length, 0),
        highConfidenceCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Resolve conflicts using Codex CLI
   */
  async resolveWithCodex(
    context: MergePromptContext,
    codexPath = "codex"
  ): Promise<AIMergeResolutionResult> {
    const prompt = this.buildMergePrompt(context);

    try {
      const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, "\\n");
      const command = `${codexPath} "${escapedPrompt}"`;

      const { stdout } = await execAsync(command, {
        cwd: this.workspacePath,
        timeout: 120000,
        maxBuffer: 5 * 1024 * 1024,
      });

      return this.parseAIResponse(stdout, context.conflicts);
    } catch (error) {
      return {
        success: false,
        resolutions: [],
        summary: "",
        totalConflicts: context.conflicts.reduce((sum, f) => sum + f.conflicts.length, 0),
        highConfidenceCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Parse AI response into structured resolutions
   */
  private parseAIResponse(
    response: string,
    conflicts: ParsedConflictFile[]
  ): AIMergeResolutionResult {
    const totalConflicts = conflicts.reduce((sum, f) => sum + f.conflicts.length, 0);

    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          resolutions: [],
          summary: "Could not parse AI response",
          totalConflicts,
          highConfidenceCount: 0,
          error: "No valid JSON found in response",
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const resolutions: AIConflictResolution[] = parsed.resolutions || [];
      const highConfidenceCount = resolutions.filter((r) => r.confidence === "high").length;

      return {
        success: true,
        resolutions,
        summary: parsed.summary || "Conflicts resolved",
        totalConflicts,
        highConfidenceCount,
      };
    } catch (parseError) {
      return {
        success: false,
        resolutions: [],
        summary: "Failed to parse AI response",
        totalConflicts,
        highConfidenceCount: 0,
        error: parseError instanceof Error ? parseError.message : "Parse error",
      };
    }
  }

  /**
   * Apply resolutions to files
   */
  async applyResolutions(
    resolutions: AIConflictResolution[],
    conflicts: ParsedConflictFile[]
  ): Promise<{ success: boolean; appliedCount: number; errors: string[] }> {
    const fs = await import("node:fs");
    const errors: string[] = [];
    let appliedCount = 0;

    for (const resolution of resolutions) {
      try {
        const conflictFile = conflicts.find((c) => c.filePath === resolution.filePath);
        if (!conflictFile) {
          errors.push(`No conflict found for ${resolution.filePath}`);
          continue;
        }

        // For simple cases with single conflict, just write the resolved content
        // For multiple conflicts in same file, we need to be more careful
        if (conflictFile.conflicts.length === 1) {
          const fullPath = `${this.workspacePath}/${resolution.filePath}`;
          fs.writeFileSync(fullPath, resolution.resolvedContent, "utf-8");
          appliedCount++;
        } else {
          // TODO: Handle multiple conflicts per file
          errors.push(`Multiple conflicts in ${resolution.filePath} - manual resolution needed`);
        }
      } catch (error) {
        errors.push(
          `Failed to apply resolution to ${resolution.filePath}: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    }

    return {
      success: errors.length === 0,
      appliedCount,
      errors,
    };
  }

  /**
   * Check if Claude CLI is available
   */
  async isClaudeAvailable(claudePath = "claude"): Promise<boolean> {
    try {
      await execAsync(`${claudePath} --version`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if Codex CLI is available
   */
  async isCodexAvailable(codexPath = "codex"): Promise<boolean> {
    try {
      await execAsync(`${codexPath} --version`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the best available AI provider for merging
   */
  async getBestProvider(): Promise<"claude" | "codex" | null> {
    if (await this.isClaudeAvailable()) {
      return "claude";
    }
    if (await this.isCodexAvailable()) {
      return "codex";
    }
    return null;
  }

  /**
   * Resolve conflicts using best available provider
   */
  async resolveConflicts(
    context: MergePromptContext,
    preferredProvider?: "claude" | "codex"
  ): Promise<AIMergeResolutionResult> {
    // Determine which provider to use
    const provider = preferredProvider || (await this.getBestProvider());

    if (!provider) {
      return {
        success: false,
        resolutions: [],
        summary: "",
        totalConflicts: context.conflicts.reduce((sum, f) => sum + f.conflicts.length, 0),
        highConfidenceCount: 0,
        error: "No AI provider available. Install Claude CLI or Codex CLI.",
      };
    }

    if (provider === "claude") {
      return this.resolveWithClaude(context);
    }
    return this.resolveWithCodex(context);
  }
}
