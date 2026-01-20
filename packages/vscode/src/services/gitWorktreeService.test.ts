import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { GitWorktreeService } from "./gitWorktreeService";

// Mock child_process
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => fn),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Import mocked modules after vi.mock
import * as childProcess from "node:child_process";
import * as fs from "node:fs";

const mockExec = childProcess.exec as unknown as Mock;
const mockExistsSync = fs.existsSync as unknown as Mock;

describe("GitWorktreeService", () => {
  let service: GitWorktreeService;

  const workspacePath = "/test/workspace";

  beforeEach(() => {
    service = new GitWorktreeService(workspacePath, {
      enabled: true,
      basePath: ".worktrees",
      branchPrefix: "task/",
      defaultBaseBranch: "main",
      autoCleanup: true,
    });

    mockExec.mockReset();
    mockExistsSync.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("generateBranchName", () => {
    it("should generate a valid branch name from task ID", () => {
      const branchName = service.generateBranchName("task-123");
      expect(branchName).toBe("task/task-123");
    });

    it("should sanitize special characters in task ID", () => {
      const branchName = service.generateBranchName("Task With Spaces & Special!");
      expect(branchName).toBe("task/task-with-spaces---special-");
    });
  });

  describe("generateWorktreePath", () => {
    it("should generate the correct worktree path", () => {
      const path = service.generateWorktreePath("my-task");
      expect(path).toBe(`${workspacePath}/.worktrees/my-task`);
    });
  });

  describe("isGitRepository", () => {
    it("should return true for a git repository", async () => {
      mockExec.mockResolvedValueOnce({ stdout: ".git\n" });

      const result = await service.isGitRepository();

      expect(result).toBe(true);
    });

    it("should return false for non-git directory", async () => {
      mockExec.mockRejectedValueOnce(new Error("not a git repository"));

      const result = await service.isGitRepository();

      expect(result).toBe(false);
    });
  });

  describe("getCurrentBranch", () => {
    it("should return the current branch name", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "feature-branch\n" });

      const result = await service.getCurrentBranch();

      expect(result).toBe("feature-branch");
    });

    it("should return default branch on error", async () => {
      mockExec.mockRejectedValueOnce(new Error("git error"));

      const result = await service.getCurrentBranch();

      expect(result).toBe("main");
    });
  });

  describe("createWorktree", () => {
    it("should create a new worktree with a new branch", async () => {
      // isGitRepository
      mockExec.mockResolvedValueOnce({ stdout: ".git\n" });
      // getDefaultBaseBranch
      mockExec.mockResolvedValueOnce({ stdout: "refs/remotes/origin/main\n" });
      // Check if worktree exists - no
      mockExistsSync.mockReturnValueOnce(false); // worktree base dir
      mockExistsSync.mockReturnValueOnce(false); // worktree path
      // Check if branch exists - no
      mockExec.mockRejectedValueOnce(new Error("branch not found"));
      // Create worktree
      mockExec.mockResolvedValueOnce({ stdout: "" });

      const result = await service.createWorktree("test-task");

      expect(result.success).toBe(true);
      expect(result.branchName).toBe("task/test-task");
      expect(result.worktreePath).toContain(".worktrees/test-task");
    });

    it("should return existing worktree if it already exists", async () => {
      // isGitRepository
      mockExec.mockResolvedValueOnce({ stdout: ".git\n" });
      // getDefaultBaseBranch
      mockExec.mockResolvedValueOnce({ stdout: "refs/remotes/origin/main\n" });
      // worktree base dir exists
      mockExistsSync.mockReturnValueOnce(true);
      // worktree path exists
      mockExistsSync.mockReturnValueOnce(true);

      const result = await service.createWorktree("test-task");

      expect(result.success).toBe(true);
      expect(result.branchName).toBe("task/test-task");
    });

    it("should return error if not a git repository", async () => {
      mockExec.mockRejectedValueOnce(new Error("not a git repository"));

      const result = await service.createWorktree("test-task");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not a git repository");
    });
  });

  describe("removeWorktree", () => {
    it("should remove an existing worktree", async () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockExec.mockResolvedValueOnce({ stdout: "" });

      const result = await service.removeWorktree("test-task");

      expect(result.success).toBe(true);
    });

    it("should return success if worktree does not exist", async () => {
      mockExistsSync.mockReturnValueOnce(false);

      const result = await service.removeWorktree("test-task");

      expect(result.success).toBe(true);
    });

    it("should use force flag when specified", async () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockExec.mockResolvedValueOnce({ stdout: "" });

      await service.removeWorktree("test-task", true);

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining("--force"), expect.any(Object));
    });
  });

  describe("listWorktrees", () => {
    it("should parse worktree list output", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: `worktree /test/workspace
HEAD abc123
branch refs/heads/main

worktree /test/workspace/.worktrees/task-1
HEAD def456
branch refs/heads/task/task-1

`,
      });

      const result = await service.listWorktrees();

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe("/test/workspace");
      expect(result[0].branch).toBe("main");
      expect(result[1].path).toBe("/test/workspace/.worktrees/task-1");
      expect(result[1].branch).toBe("task/task-1");
    });

    it("should return empty array on error", async () => {
      mockExec.mockRejectedValueOnce(new Error("git error"));

      const result = await service.listWorktrees();

      expect(result).toEqual([]);
    });
  });

  describe("getWorktreeDiff", () => {
    it("should return diff between worktree branch and base", async () => {
      // getDefaultBaseBranch
      mockExec.mockResolvedValueOnce({ stdout: "refs/remotes/origin/main\n" });
      // git diff
      mockExec.mockResolvedValueOnce({ stdout: "diff --git a/file.ts b/file.ts\n+added line" });

      const result = await service.getWorktreeDiff("test-task");

      expect(result).toContain("diff --git");
    });

    it("should return empty string on error", async () => {
      mockExec.mockRejectedValueOnce(new Error("git error"));

      const result = await service.getWorktreeDiff("test-task");

      expect(result).toBe("");
    });
  });

  describe("createWorktreeMetadata", () => {
    it("should create metadata object with correct values", () => {
      const result = {
        success: true,
        worktreePath: "/test/.worktrees/task-1",
        branchName: "task/task-1",
      };

      const metadata = service.createWorktreeMetadata("task-1", result, "main");

      expect(metadata.worktreeEnabled).toBe(true);
      expect(metadata.worktreePath).toBe("/test/.worktrees/task-1");
      expect(metadata.worktreeBranch).toBe("task/task-1");
      expect(metadata.worktreeBaseBranch).toBe("main");
      expect(metadata.worktreeStatus).toBe("active");
      expect(metadata.worktreeCreatedAt).toBeDefined();
    });
  });

  describe("updateConfig", () => {
    it("should update configuration", () => {
      service.updateConfig({ branchPrefix: "feature/" });

      const branchName = service.generateBranchName("test");
      expect(branchName).toBe("feature/test");
    });
  });
});
