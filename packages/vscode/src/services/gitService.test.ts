import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { GitService } from "./gitService";

// Mock child_process
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
}));

// Import mocked modules after vi.mock
import * as childProcess from "node:child_process";
import * as fs from "node:fs";

const mockExec = childProcess.exec as unknown as Mock;
const mockExistsSync = fs.existsSync as unknown as Mock;

describe("GitService", () => {
  let service: GitService;

  const workspacePath = "/test/workspace";

  beforeEach(() => {
    service = new GitService(workspacePath);

    mockExec.mockReset();
    mockExistsSync.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getCurrentBranch", () => {
    it("should return current branch name", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "main\n" });

      const result = await service.getCurrentBranch();

      expect(result).toBe("main");
    });

    it("should return empty string on error", async () => {
      mockExec.mockRejectedValueOnce(new Error("git error"));

      const result = await service.getCurrentBranch();

      expect(result).toBe("");
    });
  });

  describe("isMergeInProgress", () => {
    it("should return true when MERGE_HEAD exists", async () => {
      mockExec.mockResolvedValueOnce({ stdout: ".git\n" });
      mockExistsSync.mockReturnValueOnce(true);

      const result = await service.isMergeInProgress();

      expect(result).toBe(true);
    });

    it("should return false when MERGE_HEAD does not exist", async () => {
      mockExec.mockResolvedValueOnce({ stdout: ".git\n" });
      mockExistsSync.mockReturnValueOnce(false);

      const result = await service.isMergeInProgress();

      expect(result).toBe(false);
    });
  });

  describe("getConflictingFiles", () => {
    it("should return list of conflicting files", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file1.ts\nfile2.ts\n",
      });

      const result = await service.getConflictingFiles();

      expect(result).toEqual(["file1.ts", "file2.ts"]);
    });

    it("should return empty array when no conflicts", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "" });

      const result = await service.getConflictingFiles();

      expect(result).toEqual([]);
    });
  });

  describe("parseConflicts", () => {
    it("should parse conflict markers from content", () => {
      const content = `normal line
<<<<<<< HEAD
our version
=======
their version
>>>>>>> feature-branch
more normal`;

      const result = service.parseConflicts("test.ts", content);

      expect(result).toHaveLength(1);
      expect(result[0].ours).toBe("our version");
      expect(result[0].theirs).toBe("their version");
      expect(result[0].startLine).toBe(2);
      expect(result[0].endLine).toBe(6);
    });

    it("should parse multiple conflicts", () => {
      const content = `<<<<<<< HEAD
first ours
=======
first theirs
>>>>>>>
middle
<<<<<<< HEAD
second ours
=======
second theirs
>>>>>>>`;

      const result = service.parseConflicts("test.ts", content);

      expect(result).toHaveLength(2);
      expect(result[0].ours).toBe("first ours");
      expect(result[1].ours).toBe("second ours");
    });

    it("should return empty array for no conflicts", () => {
      const content = "normal content\nno conflicts here";

      const result = service.parseConflicts("test.ts", content);

      expect(result).toEqual([]);
    });
  });

  describe("checkout", () => {
    it("should checkout branch successfully", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "" });

      const result = await service.checkout("feature-branch");

      expect(result.success).toBe(true);
    });

    it("should return error on failure", async () => {
      mockExec.mockRejectedValueOnce(new Error("branch not found"));

      const result = await service.checkout("non-existent");

      expect(result.success).toBe(false);
      expect(result.error).toContain("branch not found");
    });
  });

  describe("startMerge", () => {
    it("should start merge successfully without conflicts", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "" });

      const result = await service.startMerge("feature-branch");

      expect(result.success).toBe(true);
      expect(result.hasConflicts).toBe(false);
    });

    it("should detect conflicts during merge", async () => {
      mockExec.mockRejectedValueOnce(new Error("merge conflict"));
      mockExec.mockResolvedValueOnce({ stdout: "file.ts\n" }); // getConflictingFiles

      const result = await service.startMerge("feature-branch");

      expect(result.success).toBe(false);
      expect(result.hasConflicts).toBe(true);
    });
  });

  describe("abortMerge", () => {
    it("should abort merge successfully", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "" });

      const result = await service.abortMerge();

      expect(result.success).toBe(true);
    });

    it("should return error on failure", async () => {
      mockExec.mockRejectedValueOnce(new Error("no merge to abort"));

      const result = await service.abortMerge();

      expect(result.success).toBe(false);
    });
  });

  describe("commitMerge", () => {
    it("should commit merge with message", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "" });

      const result = await service.commitMerge("Merge feature branch");

      expect(result.success).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining("Merge feature branch"),
        expect.any(Object)
      );
    });
  });

  describe("getDiff", () => {
    it("should return diff between branches", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "diff --git a/file.ts\n+added line",
      });

      const result = await service.getDiff("feature", "main");

      expect(result).toContain("diff --git");
    });

    it("should return empty string on error", async () => {
      mockExec.mockRejectedValueOnce(new Error("git error"));

      const result = await service.getDiff("feature", "main");

      expect(result).toBe("");
    });
  });

  describe("hasUncommittedChanges", () => {
    it("should return true when there are changes", async () => {
      mockExec.mockResolvedValueOnce({ stdout: " M file.ts\n" });

      const result = await service.hasUncommittedChanges();

      expect(result).toBe(true);
    });

    it("should return false when clean", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "" });

      const result = await service.hasUncommittedChanges();

      expect(result).toBe(false);
    });
  });

  describe("applyResolution", () => {
    it("should apply resolution to content with single conflict", () => {
      const rawContent = `line1
<<<<<<< HEAD
our version
=======
their version
>>>>>>> branch
line2`;

      const conflicts = [
        {
          filePath: "test.ts",
          ours: "our version",
          theirs: "their version",
          startLine: 2,
          endLine: 6,
        },
      ];

      const result = service.applyResolution(rawContent, conflicts, ["resolved content"]);

      expect(result).toContain("line1");
      expect(result).toContain("resolved content");
      expect(result).toContain("line2");
      expect(result).not.toContain("<<<<<<<");
    });
  });
});
