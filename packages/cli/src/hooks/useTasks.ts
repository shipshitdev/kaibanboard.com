/**
 * Hook for loading and watching tasks
 */

import * as path from "node:path";
import type { Task, TaskStatus } from "@kaibanboard/core";
import { CoreTaskParser } from "@kaibanboard/core";
import { watch } from "chokidar";
import { useCallback, useEffect, useState } from "react";

interface UseTasksResult {
  tasks: Task[];
  groupedTasks: Record<string, Task[]>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  updateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
}

export function useTasks(workspaceDir: string): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parser = new CoreTaskParser([{ path: workspaceDir, name: path.basename(workspaceDir) }]);

  const loadTasks = useCallback(() => {
    try {
      const loadedTasks = parser.parseTasks();
      // Sort by order then by priority
      loadedTasks.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        const priorityOrder = { High: 0, Medium: 1, Low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
      setTasks(loadedTasks);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [parser.parseTasks]);

  const updateTaskStatus = useCallback(
    (taskId: string, newStatus: TaskStatus) => {
      try {
        parser.updateTaskStatus(taskId, newStatus);
        loadTasks();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update task");
      }
    },
    [loadTasks, parser.updateTaskStatus]
  );

  useEffect(() => {
    loadTasks();

    // Watch for file changes
    const tasksDir = path.join(workspaceDir, ".agent", "TASKS");
    const watcher = watch(`${tasksDir}/**/*.md`, {
      ignoreInitial: true,
      persistent: true,
    });

    const debouncedRefresh = debounce(loadTasks, 100);

    watcher.on("add", debouncedRefresh);
    watcher.on("change", debouncedRefresh);
    watcher.on("unlink", debouncedRefresh);

    return () => {
      watcher.close();
    };
  }, [workspaceDir, loadTasks]);

  const groupedTasks = parser.groupByStatus(tasks);

  return {
    tasks,
    groupedTasks,
    loading,
    error,
    refresh: loadTasks,
    updateTaskStatus,
  };
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeoutId: NodeJS.Timeout;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}
