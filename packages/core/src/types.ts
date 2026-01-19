/**
 * Core types shared between VS Code extension and CLI
 */

// ============ Worktree Metadata ============

/** Worktree lifecycle status */
export type WorktreeStatus = "pending" | "active" | "completed" | "merged" | "removed";

/** Worktree metadata stored in task files */
export interface TaskWorktreeMetadata {
  worktreeEnabled: boolean;
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeBaseBranch?: string;
  worktreeCreatedAt?: string;
  worktreeStatus?: WorktreeStatus;
}

// ============ GitHub Metadata ============

/** GitHub issue states */
export type GitHubIssueState = "open" | "closed";

/** GitHub PR states */
export type GitHubPRState = "open" | "closed" | "merged" | "draft";

/** GitHub metadata stored in task files */
export interface GitHubMetadata {
  issueUrl?: string;
  issueNumber?: number;
  repository?: string;
  prUrl?: string;
  prNumber?: number;
  lastSynced?: string;
  issueState?: GitHubIssueState;
  prState?: GitHubPRState;
}

// ============ Task Types ============

export type TaskStatus =
  | "Backlog"
  | "Planning"
  | "In Progress"
  | "AI Review"
  | "Human Review"
  | "Done"
  | "Archived"
  | "Blocked";

export type TaskPriority = "High" | "Medium" | "Low";

export type AgentType = "Claude Code" | "Codex" | "None";

export const COLUMN_DEFAULT_AGENTS: Record<TaskStatus, AgentType> = {
  Backlog: "None",
  Planning: "Claude Code",
  "In Progress": "Claude Code",
  "AI Review": "Codex",
  "Human Review": "None",
  Done: "None",
  Archived: "None",
  Blocked: "None",
};

export interface Task {
  id: string;
  label: string;
  description: string;
  type: string;
  status: TaskStatus;
  priority: TaskPriority;
  created: string;
  updated: string;
  prdPath: string;
  filePath: string;
  completed: boolean;
  project: string;
  order?: number;
  // Agent metadata for AI loop
  claimedBy: string;
  claimedAt: string;
  completedAt: string;
  rejectionCount: number;
  agentNotes: string;
  assignedAgent?: AgentType; // Override column default agent
  // Worktree isolation metadata
  worktree?: TaskWorktreeMetadata;
  // GitHub integration metadata
  github?: GitHubMetadata;
}

export interface TaskParserConfig {
  prdBasePath?: string;
}

export const TASK_STATUSES: TaskStatus[] = [
  "Backlog",
  "Planning",
  "In Progress",
  "AI Review",
  "Human Review",
  "Done",
  "Archived",
  "Blocked",
];

export const TASK_PRIORITIES: TaskPriority[] = ["High", "Medium", "Low"];
