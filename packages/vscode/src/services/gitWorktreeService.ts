/**
 * Git Worktree Service
 * Manages git worktrees for task isolation
 */

import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import type {
  TaskWorktreeMetadata,
  WorktreeConfig,
  WorktreeCreateResult,
  WorktreeListItem,
  WorktreeMergeOptions,
  WorktreeMergeResult,
  WorktreeStatus,
} from "../types/worktree";
import { DEFAULT_WORKTREE_CONFIG } from "../types/worktree";

const execAsync = promisify(exec);

/**
 * Service for managing git worktrees for task isolation.
 * Each task can run in its own worktree with a dedicated branch.
 */
export class GitWorktreeService {
  private workspacePath: string;
  private config: WorktreeConfig;

  constructor(workspacePath: string, config?: Partial<WorktreeConfig>) {
    this.workspacePath = workspacePath;
    this.config = { ...DEFAULT_WORKTREE_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WorktreeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get the worktree base path
   */
  getWorktreeBasePath(): string {
    return path.join(this.workspacePath, this.config.basePath);
  }

  /**
   * Generate a branch name for a task
   */
  generateBranchName(taskId: string): string {
    const sanitizedId = taskId.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
    return `${this.config.branchPrefix}${sanitizedId}`;
  }

  /**
   * Generate a worktree path for a task
   */
  generateWorktreePath(taskId: string): string {
    const sanitizedId = taskId.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
    return path.join(this.getWorktreeBasePath(), sanitizedId);
  }

  /**
   * Check if git is available and this is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await execAsync("git rev-parse --git-dir", {
        cwd: this.workspacePath,
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
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
      return this.config.defaultBaseBranch;
    }
  }

  /**
   * Get the default base branch (main or master)
   */
  async getDefaultBaseBranch(): Promise<string> {
    try {
      // Try to get the default branch from remote
      const { stdout } = await execAsync(
        "git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo 'refs/heads/main'",
        { cwd: this.workspacePath, timeout: 5000 }
      );
      const ref = stdout.trim();
      const branch = ref.replace("refs/remotes/origin/", "").replace("refs/heads/", "");
      return branch || this.config.defaultBaseBranch;
    } catch {
      return this.config.defaultBaseBranch;
    }
  }

  /**
   * Create a worktree for a task
   */
  async createWorktree(taskId: string, baseBranch?: string): Promise<WorktreeCreateResult> {
    try {
      // Check if git repository
      if (!(await this.isGitRepository())) {
        return { success: false, error: "Not a git repository" };
      }

      const branchName = this.generateBranchName(taskId);
      const worktreePath = this.generateWorktreePath(taskId);
      const base = baseBranch || (await this.getDefaultBaseBranch());

      // Create the worktrees base directory if it doesn't exist
      const worktreeBaseDir = this.getWorktreeBasePath();
      if (!fs.existsSync(worktreeBaseDir)) {
        fs.mkdirSync(worktreeBaseDir, { recursive: true });
      }

      // Check if worktree already exists
      if (fs.existsSync(worktreePath)) {
        return {
          success: true,
          worktreePath,
          branchName,
        };
      }

      // Check if branch already exists
      let branchExists = false;
      try {
        await execAsync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
          cwd: this.workspacePath,
          timeout: 5000,
        });
        branchExists = true;
      } catch {
        branchExists = false;
      }

      // Create the worktree
      let command: string;
      if (branchExists) {
        // Use existing branch
        command = `git worktree add "${worktreePath}" "${branchName}"`;
      } else {
        // Create new branch from base
        command = `git worktree add -b "${branchName}" "${worktreePath}" "${base}"`;
      }

      await execAsync(command, {
        cwd: this.workspacePath,
        timeout: 30000,
      });

      return {
        success: true,
        worktreePath,
        branchName,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(
    taskId: string,
    force = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const worktreePath = this.generateWorktreePath(taskId);

      if (!fs.existsSync(worktreePath)) {
        return { success: true }; // Already removed
      }

      const forceFlag = force ? "--force" : "";
      await execAsync(`git worktree remove ${forceFlag} "${worktreePath}"`, {
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
   * Delete a worktree branch
   */
  async deleteBranch(
    branchName: string,
    force = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const forceFlag = force ? "-D" : "-d";
      await execAsync(`git branch ${forceFlag} "${branchName}"`, {
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
   * List all worktrees
   */
  async listWorktrees(): Promise<WorktreeListItem[]> {
    try {
      const { stdout } = await execAsync("git worktree list --porcelain", {
        cwd: this.workspacePath,
        timeout: 10000,
      });

      const worktrees: WorktreeListItem[] = [];
      const lines = stdout.trim().split("\n");

      let current: Partial<WorktreeListItem> = {};
      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          if (current.path) {
            worktrees.push(current as WorktreeListItem);
          }
          current = { path: line.substring(9), isMain: false, isPrunable: false };
        } else if (line.startsWith("HEAD ")) {
          current.commit = line.substring(5);
        } else if (line.startsWith("branch ")) {
          current.branch = line.substring(7).replace("refs/heads/", "");
        } else if (line === "bare") {
          current.isMain = true;
        } else if (line === "prunable") {
          current.isPrunable = true;
        } else if (line === "") {
          if (current.path) {
            worktrees.push(current as WorktreeListItem);
            current = {};
          }
        }
      }

      // Don't forget the last one
      if (current.path) {
        worktrees.push(current as WorktreeListItem);
      }

      return worktrees;
    } catch {
      return [];
    }
  }

  /**
   * Get worktree for a specific task
   */
  async getWorktreeForTask(taskId: string): Promise<WorktreeListItem | null> {
    const worktrees = await this.listWorktrees();
    const branchName = this.generateBranchName(taskId);

    return worktrees.find((w) => w.branch === branchName) || null;
  }

  /**
   * Check if a worktree exists for a task
   */
  async worktreeExists(taskId: string): Promise<boolean> {
    const worktreePath = this.generateWorktreePath(taskId);
    return fs.existsSync(worktreePath);
  }

  /**
   * Start a merge from worktree branch to base
   */
  async startMerge(taskId: string, options: WorktreeMergeOptions): Promise<WorktreeMergeResult> {
    try {
      const branchName = this.generateBranchName(taskId);
      const baseBranch = await this.getDefaultBaseBranch();

      // Switch to base branch
      await execAsync(`git checkout "${baseBranch}"`, {
        cwd: this.workspacePath,
        timeout: 10000,
      });

      // Try to merge
      try {
        const commitMsg = options.commitMessage || `Merge task ${taskId}`;
        await execAsync(`git merge --no-ff -m "${commitMsg}" "${branchName}"`, {
          cwd: this.workspacePath,
          timeout: 30000,
        });

        // Merge successful - cleanup if requested
        if (options.removeWorktree) {
          await this.removeWorktree(taskId);
        }
        if (options.deleteBranch) {
          await this.deleteBranch(branchName);
        }

        return { success: true, hasConflicts: false };
      } catch (mergeError) {
        // Check for conflicts
        const { stdout: conflictFiles } = await execAsync("git diff --name-only --diff-filter=U", {
          cwd: this.workspacePath,
          timeout: 5000,
        });

        if (conflictFiles.trim()) {
          return {
            success: false,
            hasConflicts: true,
            conflictFiles: conflictFiles.trim().split("\n"),
          };
        }

        throw mergeError;
      }
    } catch (error) {
      return {
        success: false,
        hasConflicts: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Abort an in-progress merge
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
   * Complete a merge (after conflicts resolved)
   */
  async completeMerge(commitMessage?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Stage all files
      await execAsync("git add -A", {
        cwd: this.workspacePath,
        timeout: 10000,
      });

      // Commit
      const msg = commitMessage || "Merge completed";
      await execAsync(`git commit -m "${msg}"`, {
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
   * Get diff between worktree branch and base
   */
  async getWorktreeDiff(taskId: string): Promise<string> {
    try {
      const branchName = this.generateBranchName(taskId);
      const baseBranch = await this.getDefaultBaseBranch();

      const { stdout } = await execAsync(`git diff "${baseBranch}...${branchName}"`, {
        cwd: this.workspacePath,
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      return stdout;
    } catch (_error) {
      return "";
    }
  }

  /**
   * Get list of changed files in worktree branch vs base
   */
  async getChangedFiles(taskId: string): Promise<string[]> {
    try {
      const branchName = this.generateBranchName(taskId);
      const baseBranch = await this.getDefaultBaseBranch();

      const { stdout } = await execAsync(`git diff --name-only "${baseBranch}...${branchName}"`, {
        cwd: this.workspacePath,
        timeout: 10000,
      });

      return stdout.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Create worktree metadata for a task
   */
  createWorktreeMetadata(
    _taskId: string,
    result: WorktreeCreateResult,
    baseBranch: string
  ): TaskWorktreeMetadata {
    return {
      worktreeEnabled: true,
      worktreePath: result.worktreePath,
      worktreeBranch: result.branchName,
      worktreeBaseBranch: baseBranch,
      worktreeCreatedAt: new Date().toISOString(),
      worktreeStatus: "active",
    };
  }

  /**
   * Update worktree status in metadata
   */
  updateWorktreeStatus(
    metadata: TaskWorktreeMetadata,
    status: WorktreeStatus
  ): TaskWorktreeMetadata {
    return {
      ...metadata,
      worktreeStatus: status,
    };
  }

  /**
   * Prune orphaned worktrees
   */
  async pruneWorktrees(): Promise<{ success: boolean; prunedCount: number; error?: string }> {
    try {
      const { stdout } = await execAsync("git worktree prune -v", {
        cwd: this.workspacePath,
        timeout: 30000,
      });

      // Count pruned entries (lines that start with "Removing")
      const prunedCount = (stdout.match(/Removing/g) || []).length;

      return { success: true, prunedCount };
    } catch (error) {
      return {
        success: false,
        prunedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
