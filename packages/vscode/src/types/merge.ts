/**
 * AI-Powered Merge types
 * For resolving merge conflicts with Claude/Codex assistance
 */

/** Merge conflict details */
export interface MergeConflict {
  /** File path with conflict */
  filePath: string;
  /** Our version of the conflicting content */
  ours: string;
  /** Their version of the conflicting content */
  theirs: string;
  /** Common ancestor content (if available) */
  base?: string;
  /** Line numbers where conflict starts */
  startLine: number;
  /** Line numbers where conflict ends */
  endLine: number;
}

/** Parsed merge conflict from git */
export interface ParsedConflictFile {
  /** File path */
  filePath: string;
  /** List of conflicts in this file */
  conflicts: MergeConflict[];
  /** Full file content with conflict markers */
  rawContent: string;
}

/** AI resolution for a conflict */
export interface AIConflictResolution {
  /** File path */
  filePath: string;
  /** Resolved content (replaces the conflict section) */
  resolvedContent: string;
  /** Confidence level of the resolution */
  confidence: "high" | "medium" | "low";
  /** Explanation of the resolution */
  explanation: string;
  /** Whether this resolution needs human review */
  needsReview: boolean;
}

/** Result of AI merge resolution */
export interface AIMergeResolutionResult {
  /** Whether resolution was successful */
  success: boolean;
  /** List of resolutions */
  resolutions: AIConflictResolution[];
  /** Summary of changes */
  summary: string;
  /** Total number of conflicts */
  totalConflicts: number;
  /** Number of high-confidence resolutions */
  highConfidenceCount: number;
  /** Error message if resolution failed */
  error?: string;
}

/** Merge state tracking */
export interface MergeState {
  /** Task ID being merged */
  taskId: string;
  /** Source branch (worktree branch) */
  sourceBranch: string;
  /** Target branch (base branch) */
  targetBranch: string;
  /** Current merge status */
  status: MergeStatus;
  /** Conflicts detected */
  conflicts: ParsedConflictFile[];
  /** AI resolutions (if any) */
  aiResolutions?: AIConflictResolution[];
  /** Started at timestamp */
  startedAt: string;
  /** Completed at timestamp */
  completedAt?: string;
}

/** Merge operation status */
export type MergeStatus =
  | "pending" // Merge not started
  | "in_progress" // Merge in progress
  | "conflicts" // Conflicts detected, waiting for resolution
  | "ai_resolving" // AI is resolving conflicts
  | "review" // AI resolutions ready for review
  | "completed" // Merge completed
  | "aborted"; // Merge was aborted

/** Merge panel actions */
export type MergePanelAction =
  | "accept_all" // Accept all AI resolutions
  | "edit_manually" // Open VS Code merge editor
  | "cancel" // Abort the merge
  | "accept_file" // Accept resolution for a specific file
  | "reject_file"; // Reject resolution for a specific file

/** Merge action request */
export interface MergeActionRequest {
  /** Action type */
  action: MergePanelAction;
  /** Task ID */
  taskId: string;
  /** File path (for file-specific actions) */
  filePath?: string;
}

/** Options for starting a merge */
export interface MergeOptions {
  /** Whether to use AI assistance for conflicts */
  useAI: boolean;
  /** Preferred AI provider */
  aiProvider?: "claude" | "codex";
  /** Whether to auto-complete if no conflicts */
  autoCompleteIfClean: boolean;
  /** Custom commit message */
  commitMessage?: string;
}

/** Merge prompt context for AI */
export interface MergePromptContext {
  /** Task information */
  taskLabel: string;
  taskDescription: string;
  /** PRD content (if available) */
  prdContent?: string;
  /** Files being merged */
  conflicts: ParsedConflictFile[];
  /** Additional context */
  additionalContext?: string;
}
