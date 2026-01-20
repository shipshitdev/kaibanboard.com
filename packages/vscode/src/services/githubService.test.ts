import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { GitHubService } from "./githubService";

// Mock child_process
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => fn),
}));

// Import mocked modules after vi.mock
import * as childProcess from "node:child_process";

const mockExec = childProcess.exec as unknown as Mock;

describe("GitHubService", () => {
  let service: GitHubService;

  const workspacePath = "/test/workspace";

  beforeEach(() => {
    service = new GitHubService(workspacePath);
    mockExec.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    service.clearCache();
  });

  describe("getStatus", () => {
    it("should detect gh CLI availability and authentication", async () => {
      // gh --version
      mockExec.mockResolvedValueOnce({ stdout: "gh version 2.40.0 (2024-01-01)\n" });
      // gh auth status
      mockExec.mockResolvedValueOnce({ stdout: "Logged in to github.com" });
      // gh repo view
      mockExec.mockResolvedValueOnce({ stdout: "owner/repo\n" });

      const status = await service.getStatus();

      expect(status.available).toBe(true);
      expect(status.version).toBe("2.40.0");
      expect(status.authenticated).toBe(true);
      expect(status.currentRepository).toBe("owner/repo");
    });

    it("should return unavailable when gh is not installed", async () => {
      mockExec.mockRejectedValueOnce(new Error("command not found"));

      const status = await service.getStatus();

      expect(status.available).toBe(false);
      expect(status.error).toBeDefined();
    });

    it("should cache results", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "gh version 2.40.0\n" });
      mockExec.mockResolvedValueOnce({ stdout: "Logged in" });
      mockExec.mockResolvedValueOnce({ stdout: "owner/repo\n" });

      await service.getStatus();
      const cachedStatus = await service.getStatus();

      expect(cachedStatus.available).toBe(true);
      // Should only call exec 3 times (first call), not 6
      expect(mockExec).toHaveBeenCalledTimes(3);
    });

    it("should force refresh when requested", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "gh version 2.40.0\n" });
      mockExec.mockResolvedValueOnce({ stdout: "Logged in" });
      mockExec.mockResolvedValueOnce({ stdout: "owner/repo\n" });

      await service.getStatus();

      mockExec.mockResolvedValueOnce({ stdout: "gh version 2.41.0\n" });
      mockExec.mockResolvedValueOnce({ stdout: "Logged in" });
      mockExec.mockResolvedValueOnce({ stdout: "other/repo\n" });

      const refreshedStatus = await service.getStatus(true);

      expect(refreshedStatus.version).toBe("2.41.0");
    });
  });

  describe("listIssues", () => {
    it("should list GitHub issues", async () => {
      // getStatus calls
      mockExec.mockResolvedValueOnce({ stdout: "gh version 2.40.0\n" });
      mockExec.mockResolvedValueOnce({ stdout: "Logged in" });
      mockExec.mockResolvedValueOnce({ stdout: "owner/repo\n" });
      // gh issue list
      mockExec.mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            number: 1,
            title: "Test Issue",
            body: "Issue body",
            state: "OPEN",
            url: "https://github.com/owner/repo/issues/1",
            labels: [{ name: "bug" }],
            assignees: [{ login: "user1" }],
            createdAt: "2024-01-01",
            updatedAt: "2024-01-02",
          },
        ]),
      });

      const issues = await service.listIssues();

      expect(issues).toHaveLength(1);
      expect(issues[0].number).toBe(1);
      expect(issues[0].title).toBe("Test Issue");
      expect(issues[0].labels).toEqual(["bug"]);
      expect(issues[0].assignees).toEqual(["user1"]);
    });

    it("should throw error when not authenticated", async () => {
      mockExec.mockRejectedValueOnce(new Error("command not found"));

      await expect(service.listIssues()).rejects.toThrow();
    });
  });

  describe("generateTaskFromIssue", () => {
    it("should generate task file content from issue", () => {
      const issue = {
        number: 123,
        title: "Fix login bug",
        body: "The login button doesn't work",
        state: "open" as const,
        url: "https://github.com/owner/repo/issues/123",
        labels: ["bug", "urgent"],
        assignees: ["developer"],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
        repository: "owner/repo",
      };

      const result = service.generateTaskFromIssue(issue, "/tasks");

      expect(result.filePath).toContain("fix-login-bug.md");
      expect(result.content).toContain("## Task: Fix login bug");
      expect(result.content).toContain("**ID:** gh-123");
      expect(result.content).toContain("**Type:** Bug");
      expect(result.content).toContain("**Priority:** High"); // urgent label
      expect(result.content).toContain("**GitHub:** [Issue #123]");
      expect(result.metadata.issueNumber).toBe(123);
      expect(result.metadata.issueUrl).toBe(issue.url);
    });

    it("should detect feature type from labels", () => {
      const issue = {
        number: 1,
        title: "Add feature",
        body: "",
        state: "open" as const,
        url: "https://github.com/owner/repo/issues/1",
        labels: ["feature"],
        assignees: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      const result = service.generateTaskFromIssue(issue, "/tasks");

      expect(result.content).toContain("**Type:** Feature");
    });
  });

  describe("parseIssueUrl", () => {
    it("should parse issue URL correctly", () => {
      const result = service.parseIssueUrl("https://github.com/owner/repo/issues/123");

      expect(result).toEqual({
        repository: "owner/repo",
        issueNumber: 123,
      });
    });

    it("should return null for invalid URL", () => {
      const result = service.parseIssueUrl("https://example.com/not-github");

      expect(result).toBeNull();
    });
  });

  describe("generatePRBody", () => {
    it("should generate PR body with task info", () => {
      const body = service.generatePRBody(
        "Implement feature",
        "This feature does something",
        "## Overview\n\nThis is the PRD content",
        42
      );

      expect(body).toContain("## Summary");
      expect(body).toContain("This feature does something");
      expect(body).toContain("Closes #42");
      expect(body).toContain("Kaiban Board");
    });

    it("should work without PRD content", () => {
      const body = service.generatePRBody("Fix bug", "Bug description");

      expect(body).toContain("## Summary");
      expect(body).toContain("Bug description");
      expect(body).not.toContain("Closes #");
    });
  });

  describe("createPR", () => {
    it("should create a PR successfully", async () => {
      // getStatus
      mockExec.mockResolvedValueOnce({ stdout: "gh version 2.40.0\n" });
      mockExec.mockResolvedValueOnce({ stdout: "Logged in" });
      mockExec.mockResolvedValueOnce({ stdout: "owner/repo\n" });
      // gh pr create
      mockExec.mockResolvedValueOnce({ stdout: "https://github.com/owner/repo/pull/5\n" });
      // gh pr view
      mockExec.mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 5,
          title: "My PR",
          body: "PR body",
          state: "OPEN",
          url: "https://github.com/owner/repo/pull/5",
          headRefName: "feature-branch",
          baseRefName: "main",
          isDraft: false,
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        }),
      });

      const result = await service.createPR("feature-branch", {
        title: "My PR",
        body: "PR body",
      });

      expect(result.success).toBe(true);
      expect(result.pr?.number).toBe(5);
      expect(result.pr?.title).toBe("My PR");
    });

    it("should return error when not authenticated", async () => {
      mockExec.mockRejectedValueOnce(new Error("not authenticated"));

      const result = await service.createPR("branch", { title: "PR" });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
