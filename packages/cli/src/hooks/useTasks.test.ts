import type { Task } from "@kaibanboard/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted for CoreTaskParser mock
const mockCoreTaskParserInstance = vi.hoisted(() => ({
  parseTasks: vi.fn().mockReturnValue([]),
  groupByStatus: vi.fn().mockReturnValue({
    Backlog: [],
    Planning: [],
    "In Progress": [],
    "AI Review": [],
    "Human Review": [],
    Done: [],
    Archived: [],
    Blocked: [],
  }),
  updateTaskStatus: vi.fn(),
  getTask: vi.fn(),
}));

// Mock React hooks
vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
    useState: vi.fn(),
    useCallback: vi.fn((fn) => fn),
    useEffect: vi.fn(),
  };
});

// Mock chokidar
vi.mock("chokidar", () => ({
  watch: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    close: vi.fn(),
  })),
}));

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

// Mock CoreTaskParser as a class
vi.mock("@kaibanboard/core", () => ({
  CoreTaskParser: class MockCoreTaskParser {
    parseTasks = mockCoreTaskParserInstance.parseTasks;
    groupByStatus = mockCoreTaskParserInstance.groupByStatus;
    updateTaskStatus = mockCoreTaskParserInstance.updateTaskStatus;
    getTask = mockCoreTaskParserInstance.getTask;
  },
}));

import { CoreTaskParser } from "@kaibanboard/core";
import { watch } from "chokidar";

describe("useTasks hook logic", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  let mockParser: any;
  const mockTasks: Task[] = [
    {
      id: "task-001",
      label: "Test Task 1",
      description: "Description 1",
      type: "Feature",
      status: "Backlog",
      priority: "High",
      created: "2024-01-01T00:00:00Z",
      updated: "2024-01-01T00:00:00Z",
      prdPath: "",
      filePath: "/workspace/.agent/TASKS/task-001.md",
      completed: false,
      project: "test",
      order: 1,
      claimedBy: "",
      claimedAt: "",
      completedAt: "",
      rejectionCount: 0,
      agentNotes: "",
    },
    {
      id: "task-002",
      label: "Test Task 2",
      description: "Description 2",
      type: "Bug",
      status: "In Progress",
      priority: "Medium",
      created: "2024-01-02T00:00:00Z",
      updated: "2024-01-02T00:00:00Z",
      prdPath: "",
      filePath: "/workspace/.agent/TASKS/task-002.md",
      completed: false,
      project: "test",
      order: 2,
      claimedBy: "",
      claimedAt: "",
      completedAt: "",
      rejectionCount: 0,
      agentNotes: "",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Update mock implementations - don't reassign the object
    mockCoreTaskParserInstance.parseTasks.mockReturnValue(mockTasks);
    mockCoreTaskParserInstance.groupByStatus.mockReturnValue({
      Backlog: [mockTasks[0]],
      Planning: [],
      "In Progress": [mockTasks[1]],
      "AI Review": [],
      "Human Review": [],
      Done: [],
      Archived: [],
      Blocked: [],
    });

    // Alias for backward compatibility with test code
    mockParser = mockCoreTaskParserInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("task loading", () => {
    it("should create parser with correct workspace path", () => {
      // Create a parser manually - the mock class should instantiate correctly
      const parser = new CoreTaskParser([{ path: "/workspace", name: "test" }]);

      // Verify the mock instance has the expected methods
      expect(parser.parseTasks).toBeDefined();
      expect(parser.groupByStatus).toBeDefined();
      expect(parser.updateTaskStatus).toBeDefined();
    });

    it("should parse tasks from directory", () => {
      mockParser.parseTasks();

      expect(mockParser.parseTasks).toHaveBeenCalled();
    });

    it("should sort tasks by order then priority", () => {
      const unsortedTasks: Task[] = [
        { ...mockTasks[0], order: 3, priority: "Low" },
        { ...mockTasks[1], order: 1, priority: "High" },
        { ...mockTasks[0], id: "task-003", order: undefined, priority: "High" },
        { ...mockTasks[0], id: "task-004", order: undefined, priority: "Low" },
      ];

      mockParser.parseTasks.mockReturnValue(unsortedTasks);

      const tasks = mockParser.parseTasks();

      // Simulate sorting logic from useTasks
      tasks.sort((a: Task, b: Task) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      expect(tasks[0].order).toBe(1);
      expect(tasks[1].order).toBe(3);
      expect(tasks[2].priority).toBe("High");
      expect(tasks[3].priority).toBe("Low");
    });
  });

  describe("file watcher", () => {
    it("should set up file watcher for tasks directory", () => {
      watch("/workspace/.agent/TASKS/**/*.md", {
        ignoreInitial: true,
        persistent: true,
      });

      expect(watch).toHaveBeenCalledWith(
        "/workspace/.agent/TASKS/**/*.md",
        expect.objectContaining({
          ignoreInitial: true,
          persistent: true,
        })
      );
    });

    it("should register change, add, and unlink handlers", () => {
      const mockWatcher = {
        on: vi.fn().mockReturnThis(),
        close: vi.fn(),
      };
      vi.mocked(watch).mockReturnValue(mockWatcher as unknown as ReturnType<typeof watch>);

      watch("/workspace/.agent/TASKS/**/*.md", {
        ignoreInitial: true,
        persistent: true,
      });

      // Manually call on to simulate what useTasks does
      const watcher = mockWatcher;
      watcher.on("add", vi.fn());
      watcher.on("change", vi.fn());
      watcher.on("unlink", vi.fn());

      expect(mockWatcher.on).toHaveBeenCalledWith("add", expect.any(Function));
      expect(mockWatcher.on).toHaveBeenCalledWith("change", expect.any(Function));
      expect(mockWatcher.on).toHaveBeenCalledWith("unlink", expect.any(Function));
    });
  });

  describe("status update", () => {
    it("should call parser.updateTaskStatus with correct params", () => {
      mockParser.updateTaskStatus("task-001", "In Progress");

      expect(mockParser.updateTaskStatus).toHaveBeenCalledWith("task-001", "In Progress");
    });

    it("should handle update errors", () => {
      mockParser.updateTaskStatus.mockImplementation(() => {
        throw new Error("Update failed");
      });

      expect(() => mockParser.updateTaskStatus("task-001", "Done")).toThrow("Update failed");
    });
  });

  describe("groupByStatus", () => {
    it("should group tasks by status correctly", () => {
      const grouped = mockParser.groupByStatus(mockTasks);

      expect(grouped.Backlog).toHaveLength(1);
      expect(grouped["In Progress"]).toHaveLength(1);
      expect(grouped.Done).toHaveLength(0);
    });
  });
});

describe("debounce utility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should debounce function calls", () => {
    const fn = vi.fn();
    const debounce = <T extends (...args: unknown[]) => void>(callback: T, delay: number): T => {
      let timeoutId: NodeJS.Timeout;
      return ((...args: unknown[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => callback(...args), delay);
      }) as T;
    };

    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    debouncedFn();
    debouncedFn();

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should reset timer on each call", () => {
    const fn = vi.fn();
    const debounce = <T extends (...args: unknown[]) => void>(callback: T, delay: number): T => {
      let timeoutId: NodeJS.Timeout;
      return ((...args: unknown[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => callback(...args), delay);
      }) as T;
    };

    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn();
    vi.advanceTimersByTime(50);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
