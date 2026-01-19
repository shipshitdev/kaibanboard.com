/**
 * Hook for keyboard navigation state
 */

import type { Task, TaskStatus } from "@kaibanboard/core";
import { TASK_STATUSES } from "@kaibanboard/core";
import { type Key, useInput } from "ink";
import { useCallback, useState } from "react";

export type ViewMode = "board" | "detail" | "help" | "confirm";

interface NavigationState {
  columnIndex: number;
  taskIndex: number;
  mode: ViewMode;
  selectedTask: Task | null;
  confirmAction: (() => void) | null;
  confirmMessage: string;
}

interface UseNavigationOptions {
  columns: TaskStatus[];
  groupedTasks: Record<string, Task[]>;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onExecute: (task: Task) => void;
  onQuit: () => void;
  onRefresh: () => void;
}

interface UseNavigationResult {
  state: NavigationState;
  currentColumn: TaskStatus;
  currentTask: Task | null;
  setMode: (mode: ViewMode) => void;
  closeDetail: () => void;
  confirm: (message: string, action: () => void) => void;
  cancelConfirm: () => void;
}

export function useNavigation({
  columns,
  groupedTasks,
  onStatusChange,
  onExecute,
  onQuit,
  onRefresh,
}: UseNavigationOptions): UseNavigationResult {
  const [state, setState] = useState<NavigationState>({
    columnIndex: 0,
    taskIndex: 0,
    mode: "board",
    selectedTask: null,
    confirmAction: null,
    confirmMessage: "",
  });

  const currentColumn = columns[state.columnIndex] || columns[0];
  const tasksInColumn = groupedTasks[currentColumn] || [];
  const currentTask = tasksInColumn[state.taskIndex] || null;

  const setMode = useCallback((mode: ViewMode) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const closeDetail = useCallback(() => {
    setState((prev) => ({ ...prev, mode: "board", selectedTask: null }));
  }, []);

  const confirm = useCallback((message: string, action: () => void) => {
    setState((prev) => ({
      ...prev,
      mode: "confirm",
      confirmMessage: message,
      confirmAction: action,
    }));
  }, []);

  const cancelConfirm = useCallback(() => {
    setState((prev) => ({
      ...prev,
      mode: "board",
      confirmMessage: "",
      confirmAction: null,
    }));
  }, []);

  useInput((input: string, key: Key) => {
    // Help mode
    if (state.mode === "help") {
      if (input === "?" || key.escape || input === "q") {
        setMode("board");
      }
      return;
    }

    // Confirm mode
    if (state.mode === "confirm") {
      if (input === "y" || input === "Y") {
        state.confirmAction?.();
        cancelConfirm();
      } else if (input === "n" || input === "N" || key.escape) {
        cancelConfirm();
      }
      return;
    }

    // Detail mode
    if (state.mode === "detail") {
      if (key.escape || input === "q") {
        closeDetail();
        return;
      }

      // Status change with number keys
      const statusIndex = parseInt(input, 10) - 1;
      if (statusIndex >= 0 && statusIndex < TASK_STATUSES.length && state.selectedTask) {
        const newStatus = TASK_STATUSES[statusIndex];
        onStatusChange(state.selectedTask.id, newStatus);
        closeDetail();
        return;
      }

      // Execute task
      if (input === "e" && state.selectedTask) {
        onExecute(state.selectedTask);
        closeDetail();
        return;
      }
      return;
    }

    // Board mode
    if (state.mode === "board") {
      // Navigation - left/right for columns
      if (key.leftArrow || input === "h") {
        setState((prev) => ({
          ...prev,
          columnIndex: Math.max(0, prev.columnIndex - 1),
          taskIndex: 0,
        }));
        return;
      }

      if (key.rightArrow || input === "l") {
        setState((prev) => ({
          ...prev,
          columnIndex: Math.min(columns.length - 1, prev.columnIndex + 1),
          taskIndex: 0,
        }));
        return;
      }

      // Navigation - up/down for tasks
      if (key.upArrow || input === "k") {
        setState((prev) => ({
          ...prev,
          taskIndex: Math.max(0, prev.taskIndex - 1),
        }));
        return;
      }

      if (key.downArrow || input === "j") {
        const maxIndex = tasksInColumn.length - 1;
        setState((prev) => ({
          ...prev,
          taskIndex: Math.min(maxIndex, prev.taskIndex + 1),
        }));
        return;
      }

      // Open detail view
      if (key.return && currentTask) {
        setState((prev) => ({
          ...prev,
          mode: "detail",
          selectedTask: currentTask,
        }));
        return;
      }

      // Quick execute
      if (input === "e" && currentTask) {
        onExecute(currentTask);
        return;
      }

      // Quick status change with number keys
      const statusIndex = parseInt(input, 10) - 1;
      if (statusIndex >= 0 && statusIndex < TASK_STATUSES.length && currentTask) {
        const newStatus = TASK_STATUSES[statusIndex];
        onStatusChange(currentTask.id, newStatus);
        return;
      }

      // Refresh
      if (input === "r") {
        onRefresh();
        return;
      }

      // Help
      if (input === "?") {
        setMode("help");
        return;
      }

      // Quit
      if (input === "q") {
        onQuit();
        return;
      }
    }
  });

  return {
    state,
    currentColumn,
    currentTask,
    setMode,
    closeDetail,
    confirm,
    cancelConfirm,
  };
}
