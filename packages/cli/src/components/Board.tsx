/**
 * Board component for CLI TUI
 */

import type { Task, TaskStatus } from "@kaibanboard/core";
import { Box } from "ink";
import { Column } from "./Column.js";

interface BoardProps {
  columns: TaskStatus[];
  groupedTasks: Record<string, Task[]>;
  selectedColumnIndex: number;
  selectedTaskIndex: number;
  runningTaskId?: string;
}

export function Board({
  columns,
  groupedTasks,
  selectedColumnIndex,
  selectedTaskIndex,
  runningTaskId,
}: BoardProps) {
  const columnWidth = Math.floor(90 / columns.length);

  return (
    <Box flexDirection="row" flexWrap="wrap">
      {columns.map((status, index) => (
        <Column
          key={status}
          status={status}
          tasks={groupedTasks[status] || []}
          isSelected={index === selectedColumnIndex}
          selectedTaskIndex={index === selectedColumnIndex ? selectedTaskIndex : -1}
          width={columnWidth}
          runningTaskId={runningTaskId}
        />
      ))}
    </Box>
  );
}
