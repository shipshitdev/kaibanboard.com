/**
 * Color utilities for CLI TUI
 */

import type { TaskPriority, TaskStatus } from "@kaibanboard/core";

export const STATUS_COLORS: Record<TaskStatus, string> = {
  Backlog: "gray",
  Planning: "magenta",
  "In Progress": "yellow",
  "AI Review": "cyan",
  "Human Review": "magentaBright",
  Done: "green",
  Archived: "gray",
  Blocked: "red",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  High: "red",
  Medium: "yellow",
  Low: "gray",
};

export const PRIORITY_BADGES: Record<TaskPriority, string> = {
  High: "[H]",
  Medium: "[M]",
  Low: "[L]",
};

export function getStatusColor(status: TaskStatus): string {
  return STATUS_COLORS[status] || "white";
}

export function getPriorityColor(priority: TaskPriority): string {
  return PRIORITY_COLORS[priority] || "white";
}

export function getPriorityBadge(priority: TaskPriority): string {
  return PRIORITY_BADGES[priority] || "";
}
