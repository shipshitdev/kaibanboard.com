/**
 * Git Service
 * Core git operations for merge and conflict detection
 */

import { exec } from "node:child_process";
import * as fs from "node:fs";
import { promisify } from "node:util";
import type { MergeConflict, ParsedConflictFile } from "../types/merge";

const execAsync = promisify(exec);

/**
 * Service for git operations related to merging and conflict detection.
 */
export class GitService {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const { stdout } = await execAsync("git branch --show-current", {
        cwd: this.workspacePath,
        timeout: 5000,
      });
      return stdout.trim();
    } catch {
      return "";
    }
  }

  /**
   * Check if there's a merge in progress
   */
  async isMergeInProgress(): Promise<boolean> {
    try {
      const gitDir = await this.getGitDir();
      return fs.existsSync(`${gitDir}/MERGE_HEAD`);
    } catch {
      return false;
    }
  }

  /**
   * Get the git directory path
   */
  private async getGitDir(): Promise<string> {
    const { stdout } = await execAsync("git rev-parse --git-dir", {
      cwd: this.workspacePath,
      timeout: 5000,
    });
    return stdout.trim();
  }

  /**
   * Get list of conflicting files
   */
  async getConflictingFiles(): Promise<string[]> {
    try {
      const { stdout } = await execAsync("git diff --name-only --diff-filter=U", {
        cwd: this.workspacePath,
        timeout: 10000,
      });
      return stdout.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Parse conflicts from a file
   */
  parseConflicts(filePath: string, content: string): MergeConflict[] {
    const conflicts: MergeConflict[] = [];
    const lines = content.split("\n");

    let inConflict = false;
    let ours: string[] = [];
    let theirs: string[] = [];
    let startLine = 0;
    let section: "ours" | "theirs" = "ours";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("<<<<<<<")) {
        inConflict = true;
        startLine = i + 1;
        ours = [];
        theirs = [];
        section = "ours";
      } else if (line.startsWith("=======") && inConflict) {
        section = "theirs";
      } else if (line.startsWith(">>>>>>>") && inConflict) {
        conflicts.push({
          filePath,
          ours: ours.join("\n"),
          theirs: theirs.join("\n"),
          startLine,
          endLine: i + 1,
        });
        inConflict = false;
      } else if (inConflict) {
        if (section === "ours") {
          ours.push(line);
        } else {
          theirs.push(line);
        }
      }
    }

    return conflicts;
  }

  /**
   * Get all conflicts from conflicting files
   */
  async getAllConflicts(): Promise<ParsedConflictFile[]> {
    const conflictFiles = await this.getConflictingFiles();
    const parsedFiles: ParsedConflictFile[] = [];

    for (const filePath of conflictFiles) {
      try {
        const fullPath = `${this.workspacePath}/${filePath}`;
        const content = fs.readFileSync(fullPath, "utf-8");
        const conflicts = this.parseConflicts(filePath, content);

        if (conflicts.length > 0) {
          parsedFiles.push({
            filePath,
            conflicts,
            rawContent: content,
          });
        }
      } catch {
        // File might have been deleted or moved
      }
    }

    return parsedFiles;
  }

  /**
   * Resolve a conflict in a file by replacing content
   */
  async resolveConflict(filePath: string, resolvedContent: string): Promise<void> {
    const fullPath = `${this.workspacePath}/${filePath}`;
    fs.writeFileSync(fullPath, resolvedContent, "utf-8");
  }

  /**
   * Stage a file after conflict resolution
   */
  async stageFile(filePath: string): Promise<void> {
    await execAsync(`git add "${filePath}"`, {
      cwd: this.workspacePath,
      timeout: 5000,
    });
  }

  /**
   * Stage all files
   */
  async stageAll(): Promise<void> {
    await execAsync("git add -A", {
      cwd: this.workspacePath,
      timeout: 10000,
    });
  }

  /**
   * Complete a merge with a commit
   */
  async commitMerge(message: string): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: this.workspacePath,
        timeout: 30000,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Abort the current merge
   */
  async abortMerge(): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync("git merge --abort", {
        cwd: this.workspacePath,
        timeout: 10000,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get diff between two branches
   */
  async getDiff(sourceBranch: string, targetBranch: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git diff "${targetBranch}...${sourceBranch}"`, {
        cwd: this.workspacePath,
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      return stdout;
    } catch {
      return "";
    }
  }

  /**
   * Get list of changed files between branches
   */
  async getChangedFilesBetweenBranches(
    sourceBranch: string,
    targetBranch: string
  ): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        `git diff --name-only "${targetBranch}...${sourceBranch}"`,
        { cwd: this.workspacePath, timeout: 10000 }
      );
      return stdout.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get the commit history between branches
   */
  async getCommitsBetweenBranches(
    sourceBranch: string,
    targetBranch: string
  ): Promise<Array<{ hash: string; message: string }>> {
    try {
      const { stdout } = await execAsync(`git log --oneline "${targetBranch}..${sourceBranch}"`, {
        cwd: this.workspacePath,
        timeout: 10000,
      });

      return stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, ...messageParts] = line.split(" ");
          return { hash, message: messageParts.join(" ") };
        });
    } catch {
      return [];
    }
  }

  /**
   * Check if a branch has uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const { stdout } = await execAsync("git status --porcelain", {
        cwd: this.workspacePath,
        timeout: 5000,
      });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Checkout a branch
   */
  async checkout(branchName: string): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync(`git checkout "${branchName}"`, {
        cwd: this.workspacePath,
        timeout: 30000,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Start a merge (no-commit to allow for conflict resolution)
   */
  async startMerge(
    branchName: string
  ): Promise<{ success: boolean; hasConflicts: boolean; error?: string }> {
    try {
      await execAsync(`git merge --no-commit --no-ff "${branchName}"`, {
        cwd: this.workspacePath,
        timeout: 60000,
      });
      return { success: true, hasConflicts: false };
    } catch (error) {
      // Check if it's a conflict
      const conflictFiles = await this.getConflictingFiles();
      if (conflictFiles.length > 0) {
        return { success: false, hasConflicts: true };
      }
      return {
        success: false,
        hasConflicts: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Apply a conflict resolution to a file
   */
  applyResolution(rawContent: string, conflicts: MergeConflict[], resolutions: string[]): string {
    if (conflicts.length !== resolutions.length) {
      throw new Error("Mismatch between conflicts and resolutions count");
    }

    const lines = rawContent.split("\n");
    let result = "";
    let lastEndLine = 0;

    for (let i = 0; i < conflicts.length; i++) {
      const conflict = conflicts[i];
      const resolution = resolutions[i];

      // Add lines before this conflict (accounting for 1-based line numbers and conflict markers)
      // startLine is 1-based and points to the first line after <<<<<<<
      const startMarkerLine = conflict.startLine - 1;
      const endMarkerLine = conflict.endLine - 1;

      // Add lines from lastEndLine to the line before the conflict marker
      for (let j = lastEndLine; j < startMarkerLine - 1; j++) {
        result += `${lines[j]}\n`;
      }

      // Add the resolution
      result += resolution;
      if (!resolution.endsWith("\n")) {
        result += "\n";
      }

      lastEndLine = endMarkerLine + 1;
    }

    // Add remaining lines after last conflict
    for (let j = lastEndLine; j < lines.length; j++) {
      result += lines[j];
      if (j < lines.length - 1) {
        result += "\n";
      }
    }

    return result;
  }
}
