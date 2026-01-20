import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateChangelog } from "./changelog.js";

// Use vi.hoisted for all mocks to ensure stable references
const mockCoreTaskParserInstance = vi.hoisted(() => ({
  parseTasks: vi.fn().mockReturnValue([]),
  groupByStatus: vi.fn(),
  updateTaskStatus: vi.fn(),
  getTask: vi.fn(),
}));

const mockExec = vi.hoisted(() => vi.fn());
const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  exec: mockExec,
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => fn),
}));

vi.mock("node:fs", () => ({
  existsSync: mockFs.existsSync,
  readFileSync: mockFs.readFileSync,
  writeFileSync: mockFs.writeFileSync,
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

describe("generateChangelog", () => {
  const mockCompletedTasks = [
    {
      id: "task-001",
      label: "Implement user auth",
      description: "Added OAuth2 support",
      type: "Feature",
      status: "Done",
      priority: "High",
      created: "2024-01-01T00:00:00Z",
      updated: "2024-01-15T00:00:00Z",
      completedAt: "2024-01-15T12:00:00Z",
      filePath: "/workspace/.agent/TASKS/task-001.md",
      completed: true,
      project: "test",
      claimedBy: "",
      claimedAt: "",
      rejectionCount: 0,
      agentNotes: "",
    },
    {
      id: "task-002",
      label: "Fix login bug",
      description: "Fixed session timeout issue",
      type: "Bug",
      status: "Done",
      priority: "Medium",
      created: "2024-01-10T00:00:00Z",
      updated: "2024-01-16T00:00:00Z",
      completedAt: "2024-01-16T10:00:00Z",
      filePath: "/workspace/.agent/TASKS/task-002.md",
      completed: true,
      project: "test",
      claimedBy: "",
      claimedAt: "",
      rejectionCount: 0,
      agentNotes: "",
    },
    {
      id: "task-003",
      label: "Refactor auth module",
      description: "Cleaned up authentication code",
      type: "Refactor",
      status: "Done",
      priority: "Low",
      created: "2024-01-12T00:00:00Z",
      updated: "2024-01-17T00:00:00Z",
      completedAt: "2024-01-17T08:00:00Z",
      filePath: "/workspace/.agent/TASKS/task-003.md",
      completed: true,
      project: "test",
      claimedBy: "",
      claimedAt: "",
      rejectionCount: 0,
      agentNotes: "",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.writeFileSync.mockReturnValue(undefined);

    // Setup CoreTaskParser mock to return completed tasks
    mockCoreTaskParserInstance.parseTasks.mockReturnValue(mockCompletedTasks);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("format: keepachangelog", () => {
    it("should generate changelog in Keep a Changelog format", async () => {
      const result = await generateChangelog("/workspace", {
        format: "keepachangelog",
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entryCount).toBe(3);
      expect(result.content).toContain("## [Unreleased]");
      expect(result.content).toContain("### Added");
      expect(result.content).toContain("### Changed");
      expect(result.content).toContain("### Fixed");
      expect(result.content).toContain("- Implement user auth");
      expect(result.content).toContain("- Fix login bug");
      expect(result.content).toContain("- Refactor auth module");
    });

    it("should use provided version in header", async () => {
      const result = await generateChangelog("/workspace", {
        format: "keepachangelog",
        version: "1.2.0",
        dryRun: true,
      });

      expect(result.content).toContain("## [1.2.0]");
    });

    it("should group tasks by type correctly", async () => {
      const result = await generateChangelog("/workspace", {
        format: "keepachangelog",
        dryRun: true,
      });

      // Feature -> Added
      expect(result.content).toMatch(/### Added[\s\S]*Implement user auth/);
      // Bug -> Fixed
      expect(result.content).toMatch(/### Fixed[\s\S]*Fix login bug/);
      // Refactor -> Changed
      expect(result.content).toMatch(/### Changed[\s\S]*Refactor auth module/);
    });
  });

  describe("format: markdown", () => {
    it("should generate changelog in markdown format", async () => {
      const result = await generateChangelog("/workspace", {
        format: "markdown",
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain("# Changelog - Unreleased");
      expect(result.content).toContain("## Implement user auth");
      expect(result.content).toContain("**Type:** Added");
      expect(result.content).toContain("**Completed:**");
    });

    it("should include task descriptions", async () => {
      const result = await generateChangelog("/workspace", {
        format: "markdown",
        dryRun: true,
      });

      expect(result.content).toContain("Added OAuth2 support");
      expect(result.content).toContain("Fixed session timeout issue");
    });
  });

  describe("format: json", () => {
    it("should generate changelog in JSON format", async () => {
      const result = await generateChangelog("/workspace", {
        format: "json",
        dryRun: true,
      });

      expect(result.success).toBe(true);

      const parsed = JSON.parse(result.content || "{}");
      expect(parsed.version).toBe("unreleased");
      expect(parsed.entries).toHaveLength(3);
      expect(parsed.generatedAt).toBeDefined();
    });

    it("should include all entry fields in JSON", async () => {
      const result = await generateChangelog("/workspace", {
        format: "json",
        version: "2.0.0",
        dryRun: true,
      });

      const parsed = JSON.parse(result.content || "{}");
      expect(parsed.version).toBe("2.0.0");

      const entry = parsed.entries[0];
      expect(entry).toHaveProperty("taskId");
      expect(entry).toHaveProperty("title");
      expect(entry).toHaveProperty("type");
      expect(entry).toHaveProperty("completedAt");
    });
  });

  describe("--since flag", () => {
    it("should filter tasks since a specific date", async () => {
      const result = await generateChangelog("/workspace", {
        format: "keepachangelog",
        since: "2024-01-16T00:00:00Z",
        dryRun: true,
      });

      expect(result.success).toBe(true);
      // Only tasks completed on or after Jan 16
      expect(result.entryCount).toBe(2);
    });

    it("should handle git tag as since value", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "2024-01-14T00:00:00Z\n",
      });

      const result = await generateChangelog("/workspace", {
        format: "keepachangelog",
        since: "v1.0.0",
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining("git log"), expect.any(Object));
    });

    it("should handle git tag lookup failure gracefully", async () => {
      mockExec.mockRejectedValueOnce(new Error("tag not found"));

      const result = await generateChangelog("/workspace", {
        format: "keepachangelog",
        since: "v1.0.0",
        dryRun: true,
      });

      // Should still succeed, just use all completed tasks
      expect(result.success).toBe(true);
    });
  });

  describe("file writing", () => {
    it("should write to default CHANGELOG.md when not dry run", async () => {
      await generateChangelog("/workspace", {
        format: "keepachangelog",
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "/workspace/CHANGELOG.md",
        expect.any(String),
        "utf-8"
      );
    });

    it("should write to custom output path", async () => {
      await generateChangelog("/workspace", {
        format: "json",
        outputPath: "releases/v1.json",
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "/workspace/releases/v1.json",
        expect.any(String),
        "utf-8"
      );
    });

    it("should append to existing changelog", async () => {
      const existingChangelog = `# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2024-01-01

### Added

- Initial release
`;
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(existingChangelog);

      await generateChangelog("/workspace", {
        format: "keepachangelog",
        version: "1.1.0",
      });

      const writtenContent = mockFs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain("## [1.1.0]");
      expect(writtenContent).toContain("## [1.0.0]");
    });

    it("should add Keep a Changelog header when creating new file", async () => {
      mockFs.existsSync.mockReturnValue(false);

      await generateChangelog("/workspace", {
        format: "keepachangelog",
      });

      const writtenContent = mockFs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain("# Changelog");
      expect(writtenContent).toContain("Keep a Changelog");
      expect(writtenContent).toContain("Semantic Versioning");
    });
  });

  describe("edge cases", () => {
    it("should return success with zero entries when no completed tasks", async () => {
      mockCoreTaskParserInstance.parseTasks.mockReturnValue([]);

      const result = await generateChangelog("/workspace", {
        format: "keepachangelog",
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.entryCount).toBe(0);
      expect(result.error).toContain("No completed tasks found");
    });

    it("should handle tasks without completedAt date", async () => {
      mockCoreTaskParserInstance.parseTasks.mockReturnValue([
        {
          id: "task-no-date",
          label: "Incomplete metadata",
          type: "Feature",
          status: "Done",
          completed: true,
          completedAt: "", // Missing date
        },
      ]);

      const result = await generateChangelog("/workspace", {
        format: "keepachangelog",
        dryRun: true,
      });

      // Task without completedAt should be filtered out
      expect(result.entryCount).toBe(0);
    });

    it("should handle parser errors gracefully", async () => {
      mockCoreTaskParserInstance.parseTasks.mockImplementation(() => {
        throw new Error("Parser initialization failed");
      });

      const result = await generateChangelog("/workspace", {
        format: "keepachangelog",
        dryRun: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Parser initialization failed");
    });

    it("should sort entries by completion date (newest first)", async () => {
      const result = await generateChangelog("/workspace", {
        format: "json",
        dryRun: true,
      });

      const parsed = JSON.parse(result.content || "{}");
      const dates = parsed.entries.map((e: { completedAt: string }) =>
        new Date(e.completedAt).getTime()
      );

      // Verify descending order
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
      }
    });
  });
});
