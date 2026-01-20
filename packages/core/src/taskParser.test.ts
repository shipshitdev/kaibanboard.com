import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { CoreTaskParser } from "./taskParser";
import type { Task } from "./types";

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

// Import mocked fs after vi.mock
import * as fs from "node:fs";

const mockFs = {
  existsSync: fs.existsSync as Mock,
  readFileSync: fs.readFileSync as Mock,
  writeFileSync: fs.writeFileSync as Mock,
  readdirSync: fs.readdirSync as Mock,
};

const SAMPLE_TASK_CONTENT = `## Task: Implement user authentication

**ID:** task-001
**Label:** Implement user authentication
**Description:** Add OAuth2 authentication flow
**Type:** Feature
**Status:** Backlog
**Priority:** High
**Created:** 2024-01-15T10:00:00Z
**Updated:** 2024-01-15T10:00:00Z
**PRD:** [Link](.agent/PRDS/auth-feature.md)
**Order:** 1

---

## Requirements
- Implement OAuth2 flow
- Add token refresh
`;

const SAMPLE_TASK_WITH_METADATA = `## Task: Fix login bug

**ID:** task-002
**Label:** Fix login bug
**Description:** Login fails on mobile devices
**Type:** Bug
**Status:** In Progress
**Priority:** Medium
**Created:** 2024-01-16T10:00:00Z
**Updated:** 2024-01-17T10:00:00Z
**Claimed-By:** claude-agent
**Claimed-At:** 2024-01-17T10:00:00Z
**Rejection-Count:** 1
**Agent-Notes:** First attempt failed due to CORS
Need to check headers

---

## Details
Bug description here
`;

const SAMPLE_TASK_WITH_WORKTREE = `## Task: Refactor auth module

**ID:** task-003
**Label:** Refactor auth module
**Description:** Clean up auth code
**Type:** Refactor
**Status:** Planning
**Priority:** Low
**Created:** 2024-01-18T10:00:00Z
**Updated:** 2024-01-18T10:00:00Z
**Worktree-Enabled:** true
**Worktree-Path:** /worktrees/task-003
**Worktree-Branch:** feature/task-003
**Worktree-Base-Branch:** main
**Worktree-Created-At:** 2024-01-18T11:00:00Z
**Worktree-Status:** active

---

## Details
Refactoring plan
`;

const SAMPLE_TASK_WITH_GITHUB = `## Task: Add dark mode

**ID:** task-004
**Label:** Add dark mode
**Description:** Implement dark mode theme
**Type:** Feature
**Status:** Human Review
**Priority:** High
**Created:** 2024-01-19T10:00:00Z
**Updated:** 2024-01-19T10:00:00Z
**GitHub:** [Issue #42](https://github.com/org/repo/issues/42)
**GitHub-PR:** [PR #43](https://github.com/org/repo/pull/43)
**GitHub-Synced:** 2024-01-19T12:00:00Z

---

## Details
Dark mode implementation
`;

describe("CoreTaskParser", () => {
  let parser: CoreTaskParser;
  const workspaceDirs = [{ path: "/workspace", name: "test-project" }];

  beforeEach(() => {
    parser = new CoreTaskParser(workspaceDirs);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseTaskFile", () => {
    it("should parse a valid task file", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      const tasks = parser.parseTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("task-001");
      expect(tasks[0].label).toBe("Implement user authentication");
      expect(tasks[0].description).toBe("Add OAuth2 authentication flow");
      expect(tasks[0].type).toBe("Feature");
      expect(tasks[0].status).toBe("Backlog");
      expect(tasks[0].priority).toBe("High");
      expect(tasks[0].order).toBe(1);
      expect(tasks[0].prdPath).toBe(".agent/PRDS/auth-feature.md");
      expect(tasks[0].completed).toBe(false);
    });

    it("should parse task with agent metadata", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-002.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_WITH_METADATA);

      const tasks = parser.parseTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].claimedBy).toBe("claude-agent");
      expect(tasks[0].claimedAt).toBe("2024-01-17T10:00:00Z");
      expect(tasks[0].rejectionCount).toBe(1);
      expect(tasks[0].agentNotes).toContain("First attempt failed due to CORS");
      expect(tasks[0].agentNotes).toContain("Need to check headers");
    });

    it("should parse task with worktree metadata", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-003.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_WITH_WORKTREE);

      const tasks = parser.parseTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].worktree).toBeDefined();
      expect(tasks[0].worktree?.worktreeEnabled).toBe(true);
      expect(tasks[0].worktree?.worktreePath).toBe("/worktrees/task-003");
      expect(tasks[0].worktree?.worktreeBranch).toBe("feature/task-003");
      expect(tasks[0].worktree?.worktreeBaseBranch).toBe("main");
      expect(tasks[0].worktree?.worktreeStatus).toBe("active");
    });

    it("should parse task with GitHub metadata", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-004.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_WITH_GITHUB);

      const tasks = parser.parseTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].github).toBeDefined();
      expect(tasks[0].github?.issueUrl).toBe("https://github.com/org/repo/issues/42");
      expect(tasks[0].github?.issueNumber).toBe(42);
      expect(tasks[0].github?.repository).toBe("org/repo");
      expect(tasks[0].github?.prUrl).toBe("https://github.com/org/repo/pull/43");
      expect(tasks[0].github?.prNumber).toBe(43);
    });

    it("should return empty array when no task files exist", () => {
      mockFs.existsSync.mockReturnValue(false);

      const tasks = parser.parseTasks();

      expect(tasks).toHaveLength(0);
    });

    it("should handle malformed task content gracefully", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "bad-task.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue("Just some random text without task format");

      const tasks = parser.parseTasks();

      expect(tasks).toHaveLength(0);
    });

    it("should skip README.md files", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "README.md", isFile: () => true, isDirectory: () => false },
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      const tasks = parser.parseTasks();

      expect(tasks).toHaveLength(1);
    });

    it("should recursively scan subdirectories", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync
        .mockReturnValueOnce([
          { name: "feature", isFile: () => false, isDirectory: () => true },
          { name: "task-001.md", isFile: () => true, isDirectory: () => false },
        ])
        .mockReturnValueOnce([
          { name: "task-002.md", isFile: () => true, isDirectory: () => false },
        ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      const tasks = parser.parseTasks();

      expect(tasks).toHaveLength(2);
    });

    it("should set completed to true when status is Done", () => {
      const doneTask = SAMPLE_TASK_CONTENT.replace("**Status:** Backlog", "**Status:** Done");
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-done.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(doneTask);

      const tasks = parser.parseTasks();

      expect(tasks[0].completed).toBe(true);
      expect(tasks[0].status).toBe("Done");
    });
  });

  describe("groupByStatus", () => {
    it("should group tasks by status correctly", () => {
      const mockTasks: Task[] = [
        createMockTask({ id: "1", status: "Backlog" }),
        createMockTask({ id: "2", status: "Backlog" }),
        createMockTask({ id: "3", status: "In Progress" }),
        createMockTask({ id: "4", status: "Done" }),
      ];

      const grouped = parser.groupByStatus(mockTasks);

      expect(grouped.Backlog).toHaveLength(2);
      expect(grouped["In Progress"]).toHaveLength(1);
      expect(grouped.Done).toHaveLength(1);
      expect(grouped.Planning).toHaveLength(0);
    });

    it("should return empty arrays for all statuses when no tasks", () => {
      const grouped = parser.groupByStatus([]);

      expect(grouped.Backlog).toEqual([]);
      expect(grouped.Planning).toEqual([]);
      expect(grouped["In Progress"]).toEqual([]);
      expect(grouped["AI Review"]).toEqual([]);
      expect(grouped["Human Review"]).toEqual([]);
      expect(grouped.Done).toEqual([]);
      expect(grouped.Archived).toEqual([]);
      expect(grouped.Blocked).toEqual([]);
    });
  });

  describe("updateTaskStatus", () => {
    it("should update task status in the file", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      parser.updateTaskStatus("task-001", "In Progress");

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const writtenContent = mockFs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain("**Status:** In Progress");
    });

    it("should update the Updated timestamp", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      const beforeUpdate = new Date();
      parser.updateTaskStatus("task-001", "Done");

      const writtenContent = mockFs.writeFileSync.mock.calls[0][1];
      const updatedMatch = writtenContent.match(/\*\*Updated:\*\* (.+)/);
      expect(updatedMatch).toBeTruthy();

      const updatedDate = new Date(updatedMatch[1]);
      expect(updatedDate.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it("should throw error when task is not found", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      expect(() => parser.updateTaskStatus("nonexistent-task", "Done")).toThrow(
        "Task with ID nonexistent-task not found"
      );
    });

    it("should update order when provided", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      parser.updateTaskStatus("task-001", "In Progress", 5);

      const writtenContent = mockFs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain("**Order:** 5");
    });

    it("should add order line if it does not exist", () => {
      const taskWithoutOrder = SAMPLE_TASK_CONTENT.replace("**Order:** 1\n", "");
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(taskWithoutOrder);

      parser.updateTaskStatus("task-001", "In Progress", 3);

      const writtenContent = mockFs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain("**Order:** 3");
    });
  });

  describe("updateTaskOrder", () => {
    it("should update task order in the file", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      parser.updateTaskOrder("task-001", 10);

      const writtenContent = mockFs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain("**Order:** 10");
    });

    it("should throw error when task is not found", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      expect(() => parser.updateTaskOrder("nonexistent-task", 5)).toThrow(
        "Task with ID nonexistent-task not found"
      );
    });
  });

  describe("getTask", () => {
    it("should return task by ID", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      const task = parser.getTask("task-001");

      expect(task).toBeDefined();
      expect(task?.id).toBe("task-001");
    });

    it("should return undefined when task is not found", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      const task = parser.getTask("nonexistent-task");

      expect(task).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle empty files gracefully", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "empty.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue("");

      const tasks = parser.parseTasks();

      expect(tasks).toHaveLength(0);
    });

    it("should handle file read errors gracefully", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "task-001.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const tasks = parser.parseTasks();

      expect(tasks).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should handle task with missing optional fields", () => {
      const minimalTask = `## Task: Minimal task

**ID:** task-min
**Status:** Backlog

---

Just a minimal task
`;
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: "minimal.md", isFile: () => true, isDirectory: () => false },
      ]);
      mockFs.readFileSync.mockReturnValue(minimalTask);

      const tasks = parser.parseTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("task-min");
      expect(tasks[0].label).toBe("Minimal task");
      expect(tasks[0].description).toBe("");
      expect(tasks[0].type).toBe("Task");
      expect(tasks[0].priority).toBe("Medium");
    });

    it("should parse tasks from multiple workspace directories", () => {
      const multiWorkspaceParser = new CoreTaskParser([
        { path: "/workspace1", name: "project1" },
        { path: "/workspace2", name: "project2" },
      ]);

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync
        .mockReturnValueOnce([
          { name: "task-001.md", isFile: () => true, isDirectory: () => false },
        ])
        .mockReturnValueOnce([
          { name: "task-002.md", isFile: () => true, isDirectory: () => false },
        ]);
      mockFs.readFileSync.mockReturnValue(SAMPLE_TASK_CONTENT);

      const tasks = multiWorkspaceParser.parseTasks();

      expect(tasks).toHaveLength(2);
    });
  });
});

function createMockTask(overrides: Partial<Task>): Task {
  return {
    id: "mock-id",
    label: "Mock Task",
    description: "Mock description",
    type: "Feature",
    status: "Backlog",
    priority: "Medium",
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-01T00:00:00Z",
    prdPath: "",
    filePath: "/workspace/.agent/TASKS/mock.md",
    completed: false,
    project: "test-project",
    claimedBy: "",
    claimedAt: "",
    completedAt: "",
    rejectionCount: 0,
    agentNotes: "",
    ...overrides,
  };
}
