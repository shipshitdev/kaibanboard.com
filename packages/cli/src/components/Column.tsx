/**
 * Column component for CLI TUI
 */

import type { Task, TaskStatus } from "@kaibanboard/core";
import { Box, Text } from "ink";
import { getStatusColor } from "../utils/colors.js";
import { TaskCard } from "./TaskCard.js";

interface ColumnProps {
  status: TaskStatus;
  tasks: Task[];
  isSelected: boolean;
  selectedTaskIndex: number;
  width?: number;
  runningTaskId?: string;
}

export function Column({
  status,
  tasks,
  isSelected,
  selectedTaskIndex,
  width = 22,
  runningTaskId,
}: ColumnProps) {
  const statusColor = getStatusColor(status);

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle={isSelected ? "double" : "single"}
      borderColor={isSelected ? "cyan" : "gray"}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text color={statusColor} bold>
          {status}
        </Text>
        <Text color="gray"> ({tasks.length})</Text>
      </Box>

      <Box flexDirection="column" minHeight={5}>
        {tasks.length === 0 ? (
          <Text color="gray" dimColor>
            No tasks
          </Text>
        ) : (
          tasks.map((task, index) => (
            <TaskCard
              key={task.id}
              task={task}
              isSelected={isSelected && index === selectedTaskIndex}
              isRunning={task.id === runningTaskId}
              maxWidth={width - 4}
            />
          ))
        )}
      </Box>
    </Box>
  );
}
