/**
 * Task card component for CLI TUI
 */

import type { Task } from "@kaibanboard/core";
import { Box, Text } from "ink";
import { getPriorityBadge, getPriorityColor } from "../utils/colors.js";

interface TaskCardProps {
  task: Task;
  isSelected: boolean;
  isRunning?: boolean;
  maxWidth?: number;
}

export function TaskCard({ task, isSelected, isRunning, maxWidth = 20 }: TaskCardProps) {
  const priorityBadge = getPriorityBadge(task.priority);
  const priorityColor = getPriorityColor(task.priority);

  // Truncate label if needed
  const maxLabelWidth = maxWidth - priorityBadge.length - 4; // account for badge, spaces, selection indicator
  const truncatedLabel =
    task.label.length > maxLabelWidth ? `${task.label.slice(0, maxLabelWidth - 1)}…` : task.label;

  return (
    <Box>
      <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
        {isSelected ? "▶ " : "  "}
        {isRunning ? "◉ " : ""}
        {truncatedLabel} <Text color={priorityColor}>{priorityBadge}</Text>
        {task.rejectionCount > 0 && <Text color="red"> ×{task.rejectionCount}</Text>}
      </Text>
    </Box>
  );
}
