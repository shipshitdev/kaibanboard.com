/**
 * Git Worktree types for task isolation
 * Each task can run in its own git worktree for isolated development
 */

/** Worktree metadata stored in task files */
export interface TaskWorktreeMetadata {
  /** Whether worktree isolation is enabled for this task */
  worktreeEnabled: boolean;
  /** Path to the worktree directory */
  worktreePath?: string;
  /** Branch name for the worktree */
  worktreeBranch?: string;
  /** Base branch the worktree was created from */
  worktreeBaseBranch?: string;
  /** Timestamp when worktree was created */
  worktreeCreatedAt?: string;
  /** Current worktree status */
  worktreeStatus?: WorktreeStatus;
}

/** Worktree lifecycle status */
export type WorktreeStatus =
  | "pending" // Worktree creation pending
  | "active" // Worktree is active and in use
  | "completed" // Task completed, ready for merge
  | "merged" // Worktree has been merged
  | "removed"; // Worktree has been removed

/** Configuration for worktree feature */
export interface WorktreeConfig {
  /** Whether worktree isolation is enabled globally */
  enabled: boolean;
  /** Base path for worktrees (relative to workspace) */
  basePath: string;
  /** Prefix for worktree branch names */
  branchPrefix: string;
  /** Default base branch for new worktrees */
  defaultBaseBranch: string;
  /** Whether to auto-cleanup worktrees after merge */
  autoCleanup: boolean;
}

/** Default worktree configuration */
export const DEFAULT_WORKTREE_CONFIG: WorktreeConfig = {
  enabled: false,
  basePath: ".worktrees",
  branchPrefix: "task/",
  defaultBaseBranch: "main",
  autoCleanup: true,
};

/** Result of worktree creation operation */
export interface WorktreeCreateResult {
  /** Whether creation was successful */
  success: boolean;
  /** Path to the created worktree */
  worktreePath?: string;
  /** Branch name for the worktree */
  branchName?: string;
  /** Error message if creation failed */
  error?: string;
}

/** Result of worktree list operation */
export interface WorktreeListItem {
  /** Path to the worktree */
  path: string;
  /** Branch name */
  branch: string;
  /** Commit hash */
  commit: string;
  /** Whether this is the main worktree */
  isMain: boolean;
  /** Whether the worktree is prunable (orphaned) */
  isPrunable: boolean;
}

/** Worktree merge options */
export interface WorktreeMergeOptions {
  /** Whether to delete the worktree branch after merge */
  deleteBranch: boolean;
  /** Whether to remove the worktree directory after merge */
  removeWorktree: boolean;
  /** Whether to use AI assistance for conflict resolution */
  useAIAssist: boolean;
  /** Commit message for the merge */
  commitMessage?: string;
}

/** Result of worktree merge operation */
export interface WorktreeMergeResult {
  /** Whether merge was successful */
  success: boolean;
  /** Whether there were conflicts */
  hasConflicts: boolean;
  /** List of conflicting files */
  conflictFiles?: string[];
  /** Error message if merge failed */
  error?: string;
}
