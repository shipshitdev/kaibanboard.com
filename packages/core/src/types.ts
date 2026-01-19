/**
 * Core types shared between VS Code extension and CLI
 */

export type TaskStatus = "Backlog" | "To Do" | "Doing" | "Testing" | "Done" | "Blocked";
export type TaskPriority = "High" | "Medium" | "Low";

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
}

export interface TaskParserConfig {
  prdBasePath?: string;
}

export const TASK_STATUSES: TaskStatus[] = [
  "Backlog",
  "To Do",
  "Doing",
  "Testing",
  "Done",
  "Blocked",
];

export const TASK_PRIORITIES: TaskPriority[] = ["High", "Medium", "Low"];
