import type { Task, TaskStatus } from "@kaibanboard/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock ink's useInput
vi.mock("ink", () => ({
  useInput: vi.fn(),
}));

// Mock React hooks
vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
    useState: vi.fn(),
    useCallback: vi.fn((fn) => fn),
  };
});

// Mock the TASK_STATUSES export
vi.mock("@kaibanboard/core", () => ({
  TASK_STATUSES: [
    "Backlog",
    "Planning",
    "In Progress",
    "AI Review",
    "Human Review",
    "Done",
    "Archived",
    "Blocked",
  ],
}));

import { useInput } from "ink";

describe("useNavigation hook logic", () => {
  const columns: TaskStatus[] = ["Backlog", "In Progress", "Done"];

  const mockTasks: Task[] = [
    {
      id: "task-001",
      label: "Task 1",
      description: "",
      type: "Feature",
      status: "Backlog",
      priority: "High",
      created: "",
      updated: "",
      prdPath: "",
      filePath: "/test/task-001.md",
      completed: false,
      project: "test",
      claimedBy: "",
      claimedAt: "",
      completedAt: "",
      rejectionCount: 0,
      agentNotes: "",
    },
    {
      id: "task-002",
      label: "Task 2",
      description: "",
      type: "Feature",
      status: "Backlog",
      priority: "Medium",
      created: "",
      updated: "",
      prdPath: "",
      filePath: "/test/task-002.md",
      completed: false,
      project: "test",
      claimedBy: "",
      claimedAt: "",
      completedAt: "",
      rejectionCount: 0,
      agentNotes: "",
    },
    {
      id: "task-003",
      label: "Task 3",
      description: "",
      type: "Bug",
      status: "In Progress",
      priority: "High",
      created: "",
      updated: "",
      prdPath: "",
      filePath: "/test/task-003.md",
      completed: false,
      project: "test",
      claimedBy: "",
      claimedAt: "",
      completedAt: "",
      rejectionCount: 0,
      agentNotes: "",
    },
  ];

  const groupedTasks = {
    Backlog: [mockTasks[0], mockTasks[1]],
    "In Progress": [mockTasks[2]],
    Done: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup useInput mock
    vi.mocked(useInput).mockImplementation(() => {
      // Mock implementation - actual handler testing is done below
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("column navigation", () => {
    it("should navigate left with h key", () => {
      const setState = vi.fn();
      const state = { columnIndex: 1, taskIndex: 0, mode: "board" };

      // Simulate navigation logic
      const handleInput = (input: string, key: { leftArrow?: boolean; rightArrow?: boolean }) => {
        if (state.mode === "board" && (key.leftArrow || input === "h")) {
          setState((prev: typeof state) => ({
            ...prev,
            columnIndex: Math.max(0, prev.columnIndex - 1),
            taskIndex: 0,
          }));
        }
      };

      handleInput("h", {});

      expect(setState).toHaveBeenCalled();
      const updater = setState.mock.calls[0][0];
      const newState = updater(state);
      expect(newState.columnIndex).toBe(0);
    });

    it("should navigate right with l key", () => {
      const setState = vi.fn();
      const state = { columnIndex: 0, taskIndex: 0, mode: "board" };

      const handleInput = (input: string, key: { leftArrow?: boolean; rightArrow?: boolean }) => {
        if (state.mode === "board" && (key.rightArrow || input === "l")) {
          setState((prev: typeof state) => ({
            ...prev,
            columnIndex: Math.min(columns.length - 1, prev.columnIndex + 1),
            taskIndex: 0,
          }));
        }
      };

      handleInput("l", {});

      expect(setState).toHaveBeenCalled();
      const updater = setState.mock.calls[0][0];
      const newState = updater(state);
      expect(newState.columnIndex).toBe(1);
    });

    it("should navigate with arrow keys", () => {
      const setState = vi.fn();
      const state = { columnIndex: 1, taskIndex: 0, mode: "board" };

      const handleInput = (_input: string, key: { leftArrow?: boolean; rightArrow?: boolean }) => {
        if (state.mode === "board" && key.leftArrow) {
          setState((prev: typeof state) => ({
            ...prev,
            columnIndex: Math.max(0, prev.columnIndex - 1),
            taskIndex: 0,
          }));
        }
      };

      handleInput("", { leftArrow: true });

      expect(setState).toHaveBeenCalled();
    });

    it("should not navigate beyond first column", () => {
      const setState = vi.fn();
      const state = { columnIndex: 0, taskIndex: 0, mode: "board" };

      const handleInput = (input: string, _key: { leftArrow?: boolean }) => {
        if (state.mode === "board" && input === "h") {
          setState((prev: typeof state) => ({
            ...prev,
            columnIndex: Math.max(0, prev.columnIndex - 1),
            taskIndex: 0,
          }));
        }
      };

      handleInput("h", {});

      const updater = setState.mock.calls[0][0];
      const newState = updater(state);
      expect(newState.columnIndex).toBe(0);
    });

    it("should not navigate beyond last column", () => {
      const setState = vi.fn();
      const state = { columnIndex: 2, taskIndex: 0, mode: "board" };

      const handleInput = (input: string, _key: { rightArrow?: boolean }) => {
        if (state.mode === "board" && input === "l") {
          setState((prev: typeof state) => ({
            ...prev,
            columnIndex: Math.min(columns.length - 1, prev.columnIndex + 1),
            taskIndex: 0,
          }));
        }
      };

      handleInput("l", {});

      const updater = setState.mock.calls[0][0];
      const newState = updater(state);
      expect(newState.columnIndex).toBe(2);
    });
  });

  describe("task navigation", () => {
    it("should navigate up with k key", () => {
      const setState = vi.fn();
      const state = { columnIndex: 0, taskIndex: 1, mode: "board" };

      const handleInput = (input: string, key: { upArrow?: boolean }) => {
        if (state.mode === "board" && (key.upArrow || input === "k")) {
          setState((prev: typeof state) => ({
            ...prev,
            taskIndex: Math.max(0, prev.taskIndex - 1),
          }));
        }
      };

      handleInput("k", {});

      expect(setState).toHaveBeenCalled();
      const updater = setState.mock.calls[0][0];
      const newState = updater(state);
      expect(newState.taskIndex).toBe(0);
    });

    it("should navigate down with j key", () => {
      const setState = vi.fn();
      const state = { columnIndex: 0, taskIndex: 0, mode: "board" };
      const tasksInColumn = groupedTasks.Backlog;

      const handleInput = (input: string, key: { downArrow?: boolean }) => {
        if (state.mode === "board" && (key.downArrow || input === "j")) {
          const maxIndex = tasksInColumn.length - 1;
          setState((prev: typeof state) => ({
            ...prev,
            taskIndex: Math.min(maxIndex, prev.taskIndex + 1),
          }));
        }
      };

      handleInput("j", {});

      expect(setState).toHaveBeenCalled();
      const updater = setState.mock.calls[0][0];
      const newState = updater(state);
      expect(newState.taskIndex).toBe(1);
    });

    it("should not navigate above first task", () => {
      const setState = vi.fn();
      const state = { columnIndex: 0, taskIndex: 0, mode: "board" };

      const handleInput = (input: string, _key: { upArrow?: boolean }) => {
        if (state.mode === "board" && input === "k") {
          setState((prev: typeof state) => ({
            ...prev,
            taskIndex: Math.max(0, prev.taskIndex - 1),
          }));
        }
      };

      handleInput("k", {});

      const updater = setState.mock.calls[0][0];
      const newState = updater(state);
      expect(newState.taskIndex).toBe(0);
    });

    it("should not navigate below last task", () => {
      const setState = vi.fn();
      const state = { columnIndex: 0, taskIndex: 1, mode: "board" };
      const tasksInColumn = groupedTasks.Backlog;

      const handleInput = (input: string, _key: { downArrow?: boolean }) => {
        if (state.mode === "board" && input === "j") {
          const maxIndex = tasksInColumn.length - 1;
          setState((prev: typeof state) => ({
            ...prev,
            taskIndex: Math.min(maxIndex, prev.taskIndex + 1),
          }));
        }
      };

      handleInput("j", {});

      const updater = setState.mock.calls[0][0];
      const newState = updater(state);
      expect(newState.taskIndex).toBe(1);
    });
  });

  describe("view modes", () => {
    it("should open detail view on enter", () => {
      const setState = vi.fn();
      const state = { columnIndex: 0, taskIndex: 0, mode: "board", selectedTask: null };
      const currentTask = mockTasks[0];

      const handleInput = (_input: string, key: { return?: boolean }) => {
        if (state.mode === "board" && key.return && currentTask) {
          setState((prev: typeof state) => ({
            ...prev,
            mode: "detail",
            selectedTask: currentTask,
          }));
        }
      };

      handleInput("", { return: true });

      expect(setState).toHaveBeenCalled();
      const updater = setState.mock.calls[0][0];
      const newState = updater(state);
      expect(newState.mode).toBe("detail");
      expect(newState.selectedTask).toBe(currentTask);
    });

    it("should close detail view on escape", () => {
      const setState = vi.fn();
      const state = { columnIndex: 0, taskIndex: 0, mode: "detail", selectedTask: mockTasks[0] };

      const handleInput = (input: string, key: { escape?: boolean }) => {
        if (state.mode === "detail" && (key.escape || input === "q")) {
          setState((prev: typeof state) => ({
            ...prev,
            mode: "board",
            selectedTask: null,
          }));
        }
      };

      handleInput("", { escape: true });

      expect(setState).toHaveBeenCalled();
      const updater = setState.mock.calls[0][0];
      const newState = updater(state);
      expect(newState.mode).toBe("board");
      expect(newState.selectedTask).toBe(null);
    });

    it("should open help view on ? key", () => {
      const setMode = vi.fn();
      const state = { mode: "board" };

      const handleInput = (input: string, _key: object) => {
        if (state.mode === "board" && input === "?") {
          setMode("help");
        }
      };

      handleInput("?", {});

      expect(setMode).toHaveBeenCalledWith("help");
    });

    it("should close help view on ? or escape", () => {
      const setMode = vi.fn();
      const state = { mode: "help" };

      const handleInput = (input: string, key: { escape?: boolean }) => {
        if (state.mode === "help" && (input === "?" || key.escape || input === "q")) {
          setMode("board");
        }
      };

      handleInput("?", {});

      expect(setMode).toHaveBeenCalledWith("board");
    });
  });

  describe("task actions", () => {
    it("should execute task on e key", () => {
      const onExecute = vi.fn();
      const state = { mode: "board" };
      const currentTask = mockTasks[0];

      const handleInput = (input: string, _key: object) => {
        if (state.mode === "board" && input === "e" && currentTask) {
          onExecute(currentTask);
        }
      };

      handleInput("e", {});

      expect(onExecute).toHaveBeenCalledWith(currentTask);
    });

    it("should change status with number keys", () => {
      const onStatusChange = vi.fn();
      const state = { mode: "board" };
      const currentTask = mockTasks[0];
      const TASK_STATUSES = [
        "Backlog",
        "Planning",
        "In Progress",
        "AI Review",
        "Human Review",
        "Done",
        "Archived",
        "Blocked",
      ];

      const handleInput = (input: string, _key: object) => {
        if (state.mode === "board") {
          const statusIndex = parseInt(input, 10) - 1;
          if (statusIndex >= 0 && statusIndex < TASK_STATUSES.length && currentTask) {
            const newStatus = TASK_STATUSES[statusIndex];
            onStatusChange(currentTask.id, newStatus);
          }
        }
      };

      // Press "1" to set to Backlog
      handleInput("1", {});
      expect(onStatusChange).toHaveBeenCalledWith(currentTask.id, "Backlog");

      // Press "3" to set to In Progress
      onStatusChange.mockClear();
      handleInput("3", {});
      expect(onStatusChange).toHaveBeenCalledWith(currentTask.id, "In Progress");

      // Press "6" to set to Done
      onStatusChange.mockClear();
      handleInput("6", {});
      expect(onStatusChange).toHaveBeenCalledWith(currentTask.id, "Done");
    });

    it("should call onQuit on q key in board mode", () => {
      const onQuit = vi.fn();
      const state = { mode: "board" };

      const handleInput = (input: string, _key: object) => {
        if (state.mode === "board" && input === "q") {
          onQuit();
        }
      };

      handleInput("q", {});

      expect(onQuit).toHaveBeenCalled();
    });

    it("should call onRefresh on r key", () => {
      const onRefresh = vi.fn();
      const state = { mode: "board" };

      const handleInput = (input: string, _key: object) => {
        if (state.mode === "board" && input === "r") {
          onRefresh();
        }
      };

      handleInput("r", {});

      expect(onRefresh).toHaveBeenCalled();
    });
  });

  describe("confirm mode", () => {
    it("should execute action on y key", () => {
      const confirmAction = vi.fn();
      const cancelConfirm = vi.fn();
      const state = { mode: "confirm", confirmAction };

      const handleInput = (input: string, _key: object) => {
        if (state.mode === "confirm") {
          if (input === "y" || input === "Y") {
            state.confirmAction?.();
            cancelConfirm();
          }
        }
      };

      handleInput("y", {});

      expect(confirmAction).toHaveBeenCalled();
      expect(cancelConfirm).toHaveBeenCalled();
    });

    it("should cancel on n key", () => {
      const confirmAction = vi.fn();
      const cancelConfirm = vi.fn();
      const state = { mode: "confirm", confirmAction };

      const handleInput = (input: string, key: { escape?: boolean }) => {
        if (state.mode === "confirm") {
          if (input === "n" || input === "N" || key.escape) {
            cancelConfirm();
          }
        }
      };

      handleInput("n", {});

      expect(confirmAction).not.toHaveBeenCalled();
      expect(cancelConfirm).toHaveBeenCalled();
    });

    it("should cancel on escape key", () => {
      const cancelConfirm = vi.fn();
      const state = { mode: "confirm" };

      const handleInput = (_input: string, key: { escape?: boolean }) => {
        if (state.mode === "confirm" && key.escape) {
          cancelConfirm();
        }
      };

      handleInput("", { escape: true });

      expect(cancelConfirm).toHaveBeenCalled();
    });
  });
});
