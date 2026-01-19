import type { Task } from "@kaibanboard/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangelogEntry } from "../types/changelog";
import { ChangelogService } from "./changelogService";

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => fn),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-123",
  label: "Test Task",
  description: "Test description",
  type: "Feature",
  status: "Done",
  priority: "Medium",
  created: "2026-01-01",
  updated: "2026-01-15",
  prdPath: "../PRDS/test.md",
  filePath: "/test/.agent/TASKS/test.md",
  completed: true,
  project: "test-project",
  claimedBy: "",
  claimedAt: "",
  completedAt: "2026-01-15T10:00:00Z",
  rejectionCount: 0,
  agentNotes: "",
  ...overrides,
});

describe("ChangelogService", () => {
  let service: ChangelogService;
  let mockExec: ReturnType<typeof vi.fn>;
  let mockExistsSync: ReturnType<typeof vi.fn>;
  let mockReadFileSync: ReturnType<typeof vi.fn>;
  let mockWriteFileSync: ReturnType<typeof vi.fn>;

  const workspacePath = "/test/workspace";

  beforeEach(() => {
    service = new ChangelogService(workspacePath);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const childProcess = require("node:child_process") as any;
    mockExec = childProcess.exec;
    mockExec.mockReset();

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const fs = require("node:fs") as any;
    mockExistsSync = fs.existsSync;
    mockExistsSync.mockReset();
    mockReadFileSync = fs.readFileSync;
    mockReadFileSync.mockReset();
    mockWriteFileSync = fs.writeFileSync;
    mockWriteFileSync.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getLatestTag", () => {
    it("should return latest tag", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "v1.2.0\n" });

      const result = await service.getLatestTag();

      expect(result).toBe("v1.2.0");
    });

    it("should return null on error", async () => {
      mockExec.mockRejectedValueOnce(new Error("no tags"));

      const result = await service.getLatestTag();

      expect(result).toBeNull();
    });
  });

  describe("getTagDate", () => {
    it("should return tag date", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "2026-01-10T10:00:00+00:00\n" });

      const result = await service.getTagDate("v1.0.0");

      expect(result).toBe("2026-01-10T10:00:00+00:00");
    });

    it("should return null on error", async () => {
      mockExec.mockRejectedValueOnce(new Error("tag not found"));

      const result = await service.getTagDate("v999.0.0");

      expect(result).toBeNull();
    });
  });

  describe("getAllTags", () => {
    it("should return all tags sorted by date", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "v1.2.0\nv1.1.0\nv1.0.0\n" });

      const result = await service.getAllTags();

      expect(result).toEqual(["v1.2.0", "v1.1.0", "v1.0.0"]);
    });

    it("should return empty array on error", async () => {
      mockExec.mockRejectedValueOnce(new Error("git error"));

      const result = await service.getAllTags();

      expect(result).toEqual([]);
    });
  });

  describe("getCompletedTasksSince", () => {
    it("should filter completed tasks", () => {
      const tasks = [
        createMockTask({ status: "Done", completedAt: "2026-01-15" }),
        createMockTask({ status: "In Progress" }),
        createMockTask({ status: "Done", completedAt: "2026-01-10" }),
      ];

      const result = service.getCompletedTasksSince(tasks);

      expect(result).toHaveLength(2);
    });

    it("should filter by date", () => {
      const tasks = [
        createMockTask({ id: "1", status: "Done", completedAt: "2026-01-15T10:00:00Z" }),
        createMockTask({ id: "2", status: "Done", completedAt: "2026-01-05T10:00:00Z" }),
      ];

      const result = service.getCompletedTasksSince(tasks, "2026-01-10");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("should return all completed tasks with invalid date", () => {
      const tasks = [
        createMockTask({ status: "Done", completedAt: "2026-01-15" }),
        createMockTask({ status: "Done", completedAt: "2026-01-05" }),
      ];

      const result = service.getCompletedTasksSince(tasks, "invalid-date");

      expect(result).toHaveLength(2);
    });
  });

  describe("taskToChangelogEntry", () => {
    it("should convert Feature to Added", () => {
      const task = createMockTask({ type: "Feature" });

      const result = service.taskToChangelogEntry(task);

      expect(result.type).toBe("Added");
    });

    it("should convert Enhancement to Changed", () => {
      const task = createMockTask({ type: "Enhancement" });

      const result = service.taskToChangelogEntry(task);

      expect(result.type).toBe("Changed");
    });

    it("should convert Bug to Fixed", () => {
      const task = createMockTask({ type: "Bug" });

      const result = service.taskToChangelogEntry(task);

      expect(result.type).toBe("Fixed");
    });

    it("should convert unknown type to Other", () => {
      const task = createMockTask({ type: "Documentation" });

      const result = service.taskToChangelogEntry(task);

      expect(result.type).toBe("Other");
    });
  });

  describe("groupEntriesByType", () => {
    it("should group entries by type", () => {
      const entries: ChangelogEntry[] = [
        { taskId: "1", title: "Feature 1", type: "Added", completedAt: "2026-01-15" },
        { taskId: "2", title: "Feature 2", type: "Added", completedAt: "2026-01-14" },
        { taskId: "3", title: "Bug fix", type: "Fixed", completedAt: "2026-01-13" },
      ];

      const result = service.groupEntriesByType(entries);

      expect(result.get("Added")).toHaveLength(2);
      expect(result.get("Fixed")).toHaveLength(1);
      expect(result.get("Changed")).toBeUndefined();
    });
  });

  describe("formatAsKeepAChangelog", () => {
    it("should format entries correctly", () => {
      const entries: ChangelogEntry[] = [
        { taskId: "1", title: "New feature", type: "Added", completedAt: "2026-01-15" },
        { taskId: "2", title: "Bug fix", type: "Fixed", completedAt: "2026-01-14" },
      ];

      const result = service.formatAsKeepAChangelog(entries, "1.0.0", "2026-01-15");

      expect(result).toContain("## [1.0.0] - 2026-01-15");
      expect(result).toContain("### Added");
      expect(result).toContain("- New feature");
      expect(result).toContain("### Fixed");
      expect(result).toContain("- Bug fix");
    });

    it("should use Unreleased when no version specified", () => {
      const entries: ChangelogEntry[] = [
        { taskId: "1", title: "New feature", type: "Added", completedAt: "2026-01-15" },
      ];

      const result = service.formatAsKeepAChangelog(entries);

      expect(result).toContain("[Unreleased]");
    });
  });

  describe("formatAsMarkdown", () => {
    it("should format entries as markdown", () => {
      const entries: ChangelogEntry[] = [
        {
          taskId: "1",
          title: "New feature",
          type: "Added",
          completedAt: "2026-01-15",
          description: "A new feature",
        },
      ];

      const result = service.formatAsMarkdown(entries, "1.0.0");

      expect(result).toContain("# Changelog - 1.0.0");
      expect(result).toContain("## New feature");
      expect(result).toContain("**Type:** Added");
      expect(result).toContain("A new feature");
    });
  });

  describe("formatAsJson", () => {
    it("should format entries as JSON", () => {
      const entries: ChangelogEntry[] = [
        { taskId: "1", title: "New feature", type: "Added", completedAt: "2026-01-15" },
      ];

      const result = service.formatAsJson(entries, "1.0.0");
      const parsed = JSON.parse(result);

      expect(parsed.version).toBe("1.0.0");
      expect(parsed.entries).toHaveLength(1);
      expect(parsed.entries[0].title).toBe("New feature");
    });
  });

  describe("appendToChangelog", () => {
    it("should create new file with header when no existing content", () => {
      const result = service.appendToChangelog("## [1.0.0]", null, "keepachangelog");

      expect(result).toContain("# Changelog");
      expect(result).toContain("Keep a Changelog");
      expect(result).toContain("## [1.0.0]");
    });

    it("should insert before first version section", () => {
      const existing = `# Changelog

## [0.9.0] - 2026-01-01

### Added
- Old feature`;

      const result = service.appendToChangelog(
        "## [1.0.0] - 2026-01-15\n\n### Added\n- New feature\n",
        existing,
        "keepachangelog"
      );

      expect(result).toContain("## [1.0.0]");
      expect(result).toContain("## [0.9.0]");
      expect(result.indexOf("[1.0.0]")).toBeLessThan(result.indexOf("[0.9.0]"));
    });
  });

  describe("generateChangelog", () => {
    it("should generate changelog in dry run mode", async () => {
      const tasks = [
        createMockTask({
          label: "Feature A",
          type: "Feature",
          completedAt: "2026-01-15T10:00:00Z",
        }),
        createMockTask({ label: "Bug B", type: "Bug", completedAt: "2026-01-14T10:00:00Z" }),
      ];

      const result = await service.generateChangelog(tasks, {
        format: "keepachangelog",
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entryCount).toBe(2);
      expect(result.content).toContain("Feature A");
      expect(result.content).toContain("Bug B");
    });

    it("should write to file when not dry run", async () => {
      mockExistsSync.mockReturnValue(false);

      const tasks = [createMockTask({ label: "Feature A", type: "Feature" })];

      const result = await service.generateChangelog(tasks, {
        format: "keepachangelog",
        dryRun: false,
        outputPath: "CHANGELOG.md",
      });

      expect(result.success).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it("should return error message when no completed tasks", async () => {
      const tasks = [createMockTask({ status: "In Progress" })];

      const result = await service.generateChangelog(tasks);

      expect(result.success).toBe(true);
      expect(result.entryCount).toBe(0);
      expect(result.error).toContain("No completed tasks");
    });

    it("should filter by tag date", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "2026-01-10T00:00:00Z\n" });

      const tasks = [
        createMockTask({ id: "1", label: "After tag", completedAt: "2026-01-15T10:00:00Z" }),
        createMockTask({ id: "2", label: "Before tag", completedAt: "2026-01-05T10:00:00Z" }),
      ];

      const result = await service.generateChangelog(tasks, {
        since: "v1.0.0",
        dryRun: true,
      });

      expect(result.entryCount).toBe(1);
      expect(result.content).toContain("After tag");
      expect(result.content).not.toContain("Before tag");
    });
  });
});
