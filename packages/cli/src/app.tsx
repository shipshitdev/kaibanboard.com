/**
 * Main CLI TUI application
 */

import type { TaskStatus } from "@kaibanboard/core";
import { Box, Text, useApp } from "ink";
import { useCallback, useState } from "react";
import { Board } from "./components/Board.js";
import { Help } from "./components/Help.js";
import { StatusBar } from "./components/StatusBar.js";
import { TaskDetail } from "./components/TaskDetail.js";
import { useCLI } from "./hooks/useCLI.js";
import { useNavigation } from "./hooks/useNavigation.js";
import { useTasks } from "./hooks/useTasks.js";
import { executeTask } from "./utils/executeTask.js";

interface AppProps {
  workspaceDir: string;
  columns?: TaskStatus[];
}

export function App({
  workspaceDir,
  columns = ["Backlog", "Planning", "In Progress", "AI Review", "Human Review", "Done"],
}: AppProps) {
  const { exit } = useApp();
  const { groupedTasks, loading, error, refresh, updateTaskStatus } = useTasks(workspaceDir);
  const cli = useCLI();
  const [runningTaskId, setRunningTaskId] = useState<string | undefined>();
  const [executionError, setExecutionError] = useState<string | null>(null);

  const handleExecute = useCallback(
    async (task: { id: string; filePath: string }) => {
      if (!cli.available) {
        setExecutionError("No CLI available");
        return;
      }

      setRunningTaskId(task.id);
      setExecutionError(null);

      const result = await executeTask(
        task as Parameters<typeof executeTask>[0],
        workspaceDir,
        cli.provider || undefined
      );

      setRunningTaskId(undefined);

      if (!result.success) {
        setExecutionError(result.error || "Execution failed");
      }

      refresh();
    },
    [cli.available, cli.provider, workspaceDir, refresh]
  );

  const { state, currentColumn, currentTask } = useNavigation({
    columns,
    groupedTasks,
    onStatusChange: updateTaskStatus,
    onExecute: handleExecute,
    onQuit: exit,
    onRefresh: refresh,
  });

  if (loading) {
    return (
      <Box padding={1}>
        <Text>Loading tasks...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          KAIBAN BOARD
        </Text>
        {executionError && <Text color="red"> - Error: {executionError}</Text>}
      </Box>

      {/* Main content */}
      {state.mode === "help" ? (
        <Help />
      ) : state.mode === "detail" && state.selectedTask ? (
        <TaskDetail task={state.selectedTask} />
      ) : (
        <Board
          columns={columns}
          groupedTasks={groupedTasks}
          selectedColumnIndex={state.columnIndex}
          selectedTaskIndex={state.taskIndex}
          runningTaskId={runningTaskId}
        />
      )}

      {/* Status bar */}
      <StatusBar
        cliProvider={cli.provider}
        cliVersion={cli.version}
        cliLoading={cli.loading}
        mode={state.mode === "confirm" ? "confirm" : state.mode}
      />

      {/* Current task info */}
      {state.mode === "board" && currentTask && (
        <Box paddingX={1} marginTop={1}>
          <Text color="gray">
            Selected: <Text color="white">{currentTask.label}</Text>
            {" in "}
            <Text color="white">{currentColumn}</Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}
