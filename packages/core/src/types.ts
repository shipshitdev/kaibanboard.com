/**
 * Core types shared between VS Code extension and CLI
 */

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
