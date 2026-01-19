/**
 * GitHub integration types
 * For syncing tasks with GitHub issues and creating PRs
 */

/** GitHub metadata stored in task files */
export interface GitHubMetadata {
  /** URL of the linked GitHub issue */
  issueUrl?: string;
  /** Issue number */
  issueNumber?: number;
  /** Repository in format owner/repo */
  repository?: string;
  /** URL of the pull request (if created) */
  prUrl?: string;
  /** Pull request number */
  prNumber?: number;
  /** Last sync timestamp */
  lastSynced?: string;
  /** Issue state */
  issueState?: GitHubIssueState;
  /** PR state */
  prState?: GitHubPRState;
}

/** GitHub issue states */
export type GitHubIssueState = "open" | "closed";

/** GitHub PR states */
export type GitHubPRState = "open" | "closed" | "merged" | "draft";

/** GitHub issue as returned from gh CLI */
export interface GitHubIssue {
  /** Issue number */
  number: number;
  /** Issue title */
  title: string;
  /** Issue body/description */
  body: string;
  /** Issue state */
  state: GitHubIssueState;
  /** Issue URL */
  url: string;
  /** Issue labels */
  labels: string[];
  /** Issue assignees */
  assignees: string[];
  /** Creation date */
  createdAt: string;
  /** Last update date */
  updatedAt: string;
  /** Repository */
  repository?: string;
}

/** GitHub PR as returned from gh CLI */
export interface GitHubPR {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** PR body/description */
  body: string;
  /** PR state */
  state: GitHubPRState;
  /** PR URL */
  url: string;
  /** PR head branch */
  headBranch: string;
  /** PR base branch */
  baseBranch: string;
  /** Whether PR is draft */
  isDraft: boolean;
  /** Creation date */
  createdAt: string;
  /** Last update date */
  updatedAt: string;
}

/** Options for importing GitHub issues */
export interface GitHubImportOptions {
  /** Maximum number of issues to import */
  limit?: number;
  /** Filter by state */
  state?: GitHubIssueState | "all";
  /** Filter by labels */
  labels?: string[];
  /** Filter by assignee */
  assignee?: string;
  /** Repository to import from (default: current) */
  repository?: string;
}

/** Options for creating a PR from a task */
export interface GitHubPRCreateOptions {
  /** PR title (default: task label) */
  title?: string;
  /** PR body (default: generated from task) */
  body?: string;
  /** Target base branch */
  baseBranch?: string;
  /** Whether to create as draft */
  draft?: boolean;
  /** Whether to auto-fill from task and PRD */
  autoFill?: boolean;
  /** Labels to add to PR */
  labels?: string[];
  /** Reviewers to request */
  reviewers?: string[];
}

/** Result of GitHub import operation */
export interface GitHubImportResult {
  /** Whether import was successful */
  success: boolean;
  /** Number of issues imported */
  importedCount: number;
  /** List of created task file paths */
  createdTasks: string[];
  /** Errors that occurred during import */
  errors?: string[];
}

/** Result of PR creation operation */
export interface GitHubPRCreateResult {
  /** Whether creation was successful */
  success: boolean;
  /** Created PR */
  pr?: GitHubPR;
  /** Error message if creation failed */
  error?: string;
}

/** GitHub CLI detection status */
export interface GitHubCLIStatus {
  /** Whether gh CLI is available */
  available: boolean;
  /** gh CLI version */
  version?: string;
  /** Whether user is authenticated */
  authenticated: boolean;
  /** Current repository (if detected) */
  currentRepository?: string;
  /** Error message if not available */
  error?: string;
}
