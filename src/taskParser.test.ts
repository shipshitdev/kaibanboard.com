import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { type Task, TaskParser } from "./taskParser";

// Mock fs module
vi.mock("fs");

describe("TaskParser", () => {
  let taskParser: TaskParser;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    taskParser = new TaskParser();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("parseStructuredTask (private method via parseTasks)", () => {
    it("should parse valid structured task with all metadata", async () => {
      const taskContent = `## Task: Test Task Title

**ID:** task-001
**Label:** Custom Label
**Description:** This is a test description
**Type:** Feature
**Status:** To Do
**Priority:** High
**Created:** 2024-01-01
**Updated:** 2024-01-02
**PRD:** [Link](./prd/test.md)

---

Some additional content
`;

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "test-project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(taskContent);

      const tasks = await taskParser.parseTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual(
        expect.objectContaining({
          id: "task-001",
          label: "Custom Label",
          description: "This is a test description",
          type: "Feature",
          status: "To Do",
          priority: "High",
          created: "2024-01-01",
          updated: "2024-01-02",
          prdPath: "./prd/test.md",
          completed: false,
          project: "test-project",
        })
      );
    });

    it("should use task title as label when Label field is missing", async () => {
      const taskContent = `## Task: Fallback Title

**ID:** task-002
**Status:** Backlog

---
`;

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(taskContent);

      const tasks = await taskParser.parseTasks();

      expect(tasks[0].label).toBe("Fallback Title");
    });

    it("should mark task as completed when status is Done", async () => {
      const taskContent = `## Task: Done Task

**ID:** task-003
**Status:** Done

---
`;

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(taskContent);

      const tasks = await taskParser.parseTasks();

      expect(tasks[0].completed).toBe(true);
    });

    it("should parse agent metadata fields", async () => {
      const taskContent = `## Task: Agent Task

**ID:** task-004
**Status:** Testing
**Claimed-By:** claude-opus
**Claimed-At:** 2024-01-15T10:00:00Z
**Completed-At:** 2024-01-16T10:00:00Z
**Rejection-Count:** 2
**Agent-Notes:**
First note line
Second note line

---
`;

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(taskContent);

      const tasks = await taskParser.parseTasks();

      expect(tasks[0].claimedBy).toBe("claude-opus");
      expect(tasks[0].claimedAt).toBe("2024-01-15T10:00:00Z");
      expect(tasks[0].completedAt).toBe("2024-01-16T10:00:00Z");
      expect(tasks[0].rejectionCount).toBe(2);
      expect(tasks[0].agentNotes).toContain("First note line");
      expect(tasks[0].agentNotes).toContain("Second note line");
    });

    it("should return null for invalid task format (no title)", async () => {
      const taskContent = "Invalid content without task title";

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(taskContent);

      const tasks = await taskParser.parseTasks();

      expect(tasks).toHaveLength(0);
    });

    it("should use default values for missing optional metadata", async () => {
      const taskContent = `## Task: Minimal Task

**ID:** task-005

---
`;

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(taskContent);

      const tasks = await taskParser.parseTasks();

      expect(tasks[0].type).toBe("Task");
      expect(tasks[0].status).toBe("To Do");
      expect(tasks[0].priority).toBe("Medium");
      expect(tasks[0].description).toBe("");
      expect(tasks[0].prdPath).toBe("");
      expect(tasks[0].claimedBy).toBe("");
      expect(tasks[0].rejectionCount).toBe(0);
    });

    it("should fall back when metadata values are missing", async () => {
      const taskContent = `## Task: Missing Metadata

**ID:**
**Label:**
**Description:**
**Type:**
**Status:**
**Priority:**
**Created:**
**Updated:**
**PRD:** [Link]()
**Rejection-Count:** not-a-number

---`;

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(taskContent);

      const tasks = await taskParser.parseTasks();

      expect(tasks[0].id).toBe("");
      expect(tasks[0].label).toBe("Missing Metadata");
      expect(tasks[0].status).toBe("To Do");
      expect(tasks[0].priority).toBe("Medium");
      expect(tasks[0].rejectionCount).toBe(0);
    });
  });

  describe("findTaskFiles", () => {
    it("should return empty array when no workspace folders", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = undefined;

      const tasks = await taskParser.parseTasks();

      expect(tasks).toEqual([]);
    });

    it("should skip non-existent TASKS directories", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const tasks = await taskParser.parseTasks();

      expect(tasks).toEqual([]);
    });

    it("should scan multiple workspace folders", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace1" }, name: "project1" },
        { uri: { fsPath: "/workspace2" }, name: "project2" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      await taskParser.parseTasks();

      expect(fs.existsSync).toHaveBeenCalledWith(path.join("/workspace1", ".agent", "TASKS"));
      expect(fs.existsSync).toHaveBeenCalledWith(path.join("/workspace2", ".agent", "TASKS"));
    });
  });

  describe("scanDirectoryRecursive", () => {
    it("should exclude README.md files", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "README.md", isDirectory: () => false, isFile: () => true },
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`## Task: Test

**ID:** task-001

---`);

      const tasks = await taskParser.parseTasks();

      // Only task.md should be parsed, not README.md
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      expect(tasks).toHaveLength(1);
    });

    it("should recursively scan subdirectories", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync)
        .mockReturnValueOnce([
          { name: "subdir", isDirectory: () => true, isFile: () => false },
        ] as unknown as fs.Dirent[])
        .mockReturnValueOnce([
          { name: "nested-task.md", isDirectory: () => false, isFile: () => true },
        ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`## Task: Nested

**ID:** nested-001

---`);

      const tasks = await taskParser.parseTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("nested-001");
    });

    it("should handle non-existent directory in recursive scan", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true) // TASKS directory exists
        .mockReturnValueOnce(false); // Subdirectory doesn't exist

      vi.mocked(fs.readdirSync).mockReturnValueOnce([
        { name: "subdir", isDirectory: () => true, isFile: () => false },
      ] as unknown as fs.Dirent[]);

      const tasks = await taskParser.parseTasks();

      expect(tasks).toHaveLength(0);
    });
  });

  describe("parseTasks", () => {
    it("should handle file read errors gracefully", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("Read error");
      });

      const tasks = await taskParser.parseTasks();

      expect(tasks).toHaveLength(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should parse multiple task files", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task1.md", isDirectory: () => false, isFile: () => true },
        { name: "task2.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(`## Task: Task 1\n\n**ID:** task-001\n\n---`)
        .mockReturnValueOnce(`## Task: Task 2\n\n**ID:** task-002\n\n---`);

      const tasks = await taskParser.parseTasks();

      expect(tasks).toHaveLength(2);
    });
  });

  describe("groupByStatus", () => {
    it("should group tasks by their status", () => {
      const tasks: Task[] = [
        { status: "Backlog" } as Task,
        { status: "To Do" } as Task,
        { status: "Testing" } as Task,
        { status: "Done" } as Task,
        { status: "Backlog" } as Task,
      ];

      const grouped = taskParser.groupByStatus(tasks);

      expect(grouped.Backlog).toHaveLength(2);
      expect(grouped["To Do"]).toHaveLength(1);
      expect(grouped.Testing).toHaveLength(1);
      expect(grouped.Done).toHaveLength(1);
    });

    it("should handle empty task array", () => {
      const grouped = taskParser.groupByStatus([]);

      expect(grouped.Backlog).toHaveLength(0);
      expect(grouped["To Do"]).toHaveLength(0);
      expect(grouped.Testing).toHaveLength(0);
      expect(grouped.Done).toHaveLength(0);
    });

    it("should ignore tasks with unknown status", () => {
      const tasks: Task[] = [
        { status: "Unknown" as "Backlog" } as Task,
        { status: "Backlog" } as Task,
      ];

      const grouped = taskParser.groupByStatus(tasks);

      expect(grouped.Backlog).toHaveLength(1);
    });
  });

  describe("writeTask", () => {
    it("should write task in structured format", () => {
      const task: Task = {
        id: "task-001",
        label: "Test Task",
        description: "Test description",
        type: "Feature",
        status: "To Do",
        priority: "High",
        created: "2024-01-01",
        updated: "2024-01-02",
        prdPath: "./prd/test.md",
        filePath: "/path/to/task.md",
        completed: false,
        project: "project",
        claimedBy: "",
        claimedAt: "",
        completedAt: "",
        rejectionCount: 0,
        agentNotes: "",
      };

      taskParser.writeTask(task);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        "/path/to/task.md",
        expect.stringContaining("## Task: Test Task"),
        "utf-8"
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        "/path/to/task.md",
        expect.stringContaining("**ID:** task-001"),
        "utf-8"
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        "/path/to/task.md",
        expect.stringContaining("**Status:** To Do"),
        "utf-8"
      );
    });
  });

  describe("updateTaskStatus", () => {
    it("should update task status and timestamp", async () => {
      const originalContent = `## Task: Test

**ID:** task-001
**Status:** Backlog
**Updated:** 2024-01-01

---`;

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(originalContent);

      await taskParser.updateTaskStatus("task-001", "To Do");

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("**Status:** To Do"),
        "utf-8"
      );
    });

    it("should throw error when task not found", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [];

      await expect(taskParser.updateTaskStatus("nonexistent", "Done")).rejects.toThrow(
        "Task with ID nonexistent not found"
      );
    });

    it("should update PRD status when PRD has status field", async () => {
      const taskContent = `## Task: Test\n\n**ID:** task-001\n**Status:** Backlog\n**Updated:** 2024-01-01\n**PRD:** [Link](../PRDS/prd.md)\n\n---`;
      const prdContent = "# PRD\n\n**Status:** Backlog\n\nDetails";

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockImplementation((pathValue) => {
        return String(pathValue).includes(".agent/TASKS") || String(pathValue).includes("PRDS");
      });
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((pathValue) =>
        String(pathValue).includes("prd.md") ? prdContent : taskContent
      );

      await taskParser.updateTaskStatus("task-001", "Done");

      const prdWriteCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("prd.md"));
      expect(prdWriteCall?.[1]).toContain("**Status:** Done");
    });

    it("should insert PRD status when missing", async () => {
      const taskContent = `## Task: Test\n\n**ID:** task-002\n**Status:** Backlog\n**Updated:** 2024-01-01\n**PRD:** [Link](./prd.md)\n\n---`;
      const prdContent = "# PRD\n\nDetails";

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockImplementation((pathValue) => {
        return String(pathValue).includes(".agent/TASKS") || String(pathValue).includes("prd.md");
      });
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((pathValue) =>
        String(pathValue).includes("prd.md") ? prdContent : taskContent
      );

      await taskParser.updateTaskStatus("task-002", "Testing");

      const prdWriteCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("prd.md"));
      expect(prdWriteCall?.[1]).toContain("**Status:** Testing");
    });

    it("should insert PRD status when no heading is present", async () => {
      const taskContent = `## Task: Test\n\n**ID:** task-007\n**Status:** Backlog\n**Updated:** 2024-01-01\n**PRD:** [Link](./prd.md)\n\n---`;
      const prdContent = "PRD details without heading";

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockImplementation((pathValue) => {
        return String(pathValue).includes(".agent/TASKS") || String(pathValue).includes("prd.md");
      });
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((pathValue) =>
        String(pathValue).includes("prd.md") ? prdContent : taskContent
      );

      await taskParser.updateTaskStatus("task-007", "Testing");

      const prdWriteCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("prd.md"));
      expect(prdWriteCall?.[1]).toContain("**Status:** Testing");
    });

    it("should skip PRD update when file does not exist", async () => {
      const taskContent = `## Task: Test\n\n**ID:** task-003\n**Status:** Backlog\n**Updated:** 2024-01-01\n**PRD:** [Link](missing.md)\n\n---`;

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue(".agent/PRDS"),
      } as unknown as vscode.WorkspaceConfiguration);

      vi.mocked(fs.existsSync).mockImplementation((pathValue) => {
        return String(pathValue).includes(".agent/TASKS");
      });
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(taskContent);

      await taskParser.updateTaskStatus("task-003", "Done");

      const prdWriteCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("missing.md"));
      expect(prdWriteCall).toBeUndefined();
    });

    it("should resolve absolute PRD path", async () => {
      const taskContent = `## Task: Test\n\n**ID:** task-005\n**Status:** Backlog\n**Updated:** 2024-01-01\n**PRD:** [Link](/workspace/prd.md)\n\n---`;
      const prdContent = "# PRD\n\n**Status:** Backlog\n\nDetails";

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockImplementation((pathValue) => {
        const pathString = String(pathValue);
        return pathString.includes(".agent/TASKS") || pathString === "/workspace/prd.md";
      });
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((pathValue) =>
        String(pathValue).includes("/workspace/prd.md") ? prdContent : taskContent
      );

      await taskParser.updateTaskStatus("task-005", "Done");

      const prdWriteCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => call[0] === "/workspace/prd.md");
      expect(prdWriteCall?.[1]).toContain("**Status:** Done");
    });

    it("should resolve PRD path relative to task file when no workspace folders", async () => {
      const taskContent = `## Task: Test\n\n**ID:** task-006\n**Status:** Backlog\n**Updated:** 2024-01-01\n**PRD:** [Link](prd.md)\n\n---`;
      const prdContent = "# PRD\n\n**Status:** Backlog\n\nDetails";

      vi.mocked(vscode.workspace).workspaceFolders = undefined;

      vi.spyOn(taskParser, "parseTasks").mockResolvedValue([
        {
          id: "task-006",
          label: "Test",
          description: "",
          type: "Task",
          status: "Backlog",
          priority: "Medium",
          created: "",
          updated: "",
          prdPath: "prd.md",
          filePath: "/workspace/.agent/TASKS/task.md",
          completed: false,
          project: "project",
          claimedBy: "",
          claimedAt: "",
          completedAt: "",
          rejectionCount: 0,
          agentNotes: "",
        },
      ]);

      vi.mocked(fs.existsSync).mockImplementation((pathValue) => {
        const pathString = String(pathValue);
        return pathString.includes(".agent/TASKS") || pathString.endsWith("/prd.md");
      });
      vi.mocked(fs.readFileSync).mockImplementation((pathValue) =>
        String(pathValue).endsWith("/prd.md") ? prdContent : taskContent
      );

      await taskParser.updateTaskStatus("task-006", "Done");

      const prdWriteCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => String(call[0]).endsWith("/prd.md"));
      expect(prdWriteCall?.[1]).toContain("**Status:** Done");
    });

    it("should warn when PRD update fails", async () => {
      const taskContent = `## Task: Test\n\n**ID:** task-004\n**Status:** Backlog\n**Updated:** 2024-01-01\n**PRD:** [Link](./prd.md)\n\n---`;

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockImplementation((pathValue) => {
        return String(pathValue).includes(".agent/TASKS") || String(pathValue).includes("prd.md");
      });
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((pathValue) => {
        if (String(pathValue).includes("prd.md")) {
          throw new Error("PRD read error");
        }
        return taskContent;
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await taskParser.updateTaskStatus("task-004", "Done");
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("rejectTask", () => {
    it("should reject task and increment rejection count", async () => {
      const originalContent = `## Task: Test

**ID:** task-001
**Status:** Testing
**Updated:** 2024-01-01
**Claimed-By:** claude
**Claimed-At:** 2024-01-01
**Completed-At:** 2024-01-02
**Rejection-Count:** 0
**Rejections:**

---`;

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(originalContent);

      await taskParser.rejectTask("task-001", "Needs more work");

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = writeCall[1] as string;

      expect(writtenContent).toContain("**Status:** To Do");
      expect(writtenContent).toContain("**Rejection-Count:** 1");
      expect(writtenContent).toContain("**Claimed-By:**");
      expect(writtenContent).toContain("Needs more work");
    });

    it("should clear agent claim fields on rejection", async () => {
      const originalContent = `## Task: Test

**ID:** task-001
**Status:** Testing
**Updated:** 2024-01-01
**Claimed-By:** claude-opus
**Claimed-At:** 2024-01-15
**Completed-At:** 2024-01-16
**Rejection-Count:** 1
**Rejections:**

---`;

      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" }, name: "project" },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: "task.md", isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(originalContent);

      await taskParser.rejectTask("task-001", "Not good enough");

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = writeCall[1] as string;

      // Claimed fields should be empty after rejection
      expect(writtenContent).toContain("**Claimed-By:**\n");
      expect(writtenContent).toContain("**Claimed-At:**\n");
      expect(writtenContent).toContain("**Completed-At:**\n");
    });

    it("should throw error when task not found for rejection", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [];

      await expect(taskParser.rejectTask("nonexistent", "note")).rejects.toThrow(
        "Task with ID nonexistent not found"
      );
    });
  });
});
