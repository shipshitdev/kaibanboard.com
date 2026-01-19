import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewFindingType } from "../types/review";
import { CodexReviewService } from "./codexReviewService";

// Mock child_process
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => fn),
}));

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe("CodexReviewService", () => {
  let service: CodexReviewService;
  let mockExec: ReturnType<typeof vi.fn>;

  const workspacePath = "/test/workspace";

  beforeEach(() => {
    service = new CodexReviewService(workspacePath);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const childProcess = require("node:child_process") as any;
    mockExec = childProcess.exec;
    mockExec.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getCodexStatus", () => {
    it("should detect codex CLI when available", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "codex version 1.0.0" });

      const status = await service.getCodexStatus();

      expect(status.available).toBe(true);
      expect(status.version).toBe("1.0.0");
    });

    it("should provide fallback message when codex unavailable but claude available", async () => {
      mockExec.mockRejectedValueOnce(new Error("not found")); // codex
      mockExec.mockResolvedValueOnce({ stdout: "claude v1.0" }); // claude

      const status = await service.getCodexStatus();

      expect(status.available).toBe(false);
      expect(status.fallbackMessage).toContain("Claude CLI");
    });

    it("should return error when neither available", async () => {
      mockExec.mockRejectedValue(new Error("not found"));

      const status = await service.getCodexStatus();

      expect(status.available).toBe(false);
      expect(status.error).toContain("Neither Codex nor Claude");
    });
  });

  describe("buildReviewPrompt", () => {
    it("should build review prompt with context", () => {
      const context = {
        taskLabel: "Fix bug",
        taskDescription: "This fixes a critical bug",
        diff: "diff --git a/file.ts\n+added line",
        filesChanged: ["file.ts"],
        focusAreas: ["bug", "security"] as ReviewFindingType[],
      };

      const prompt = service.buildReviewPrompt(context);

      expect(prompt).toContain("Fix bug");
      expect(prompt).toContain("critical bug");
      expect(prompt).toContain("file.ts");
      expect(prompt).toContain("Logic errors");
      expect(prompt).toContain("Vulnerabilities");
      expect(prompt).toContain("JSON");
    });

    it("should include PRD content when provided", () => {
      const context = {
        taskLabel: "Task",
        taskDescription: "Description",
        prdContent: "## Requirements\n- Must be secure",
        diff: "diff",
        filesChanged: [],
        focusAreas: ["bug"] as ReviewFindingType[],
      };

      const prompt = service.buildReviewPrompt(context);

      expect(prompt).toContain("PRD Context");
      expect(prompt).toContain("Must be secure");
    });

    it("should truncate long diffs", () => {
      const longDiff = "x".repeat(20000);
      const context = {
        taskLabel: "Task",
        taskDescription: "Description",
        diff: longDiff,
        filesChanged: [],
        focusAreas: ["bug"] as ReviewFindingType[],
      };

      const prompt = service.buildReviewPrompt(context);

      expect(prompt).toContain("truncated");
    });
  });

  describe("runReview", () => {
    it("should run review with codex when available", async () => {
      // getCodexStatus - available
      mockExec.mockResolvedValueOnce({ stdout: "codex 1.0.0" });
      // reviewWithCodex
      mockExec.mockResolvedValueOnce({
        stdout: JSON.stringify({
          summary: "Code looks good",
          overallRating: "pass",
          findings: [],
          suggestedActions: [],
        }),
      });

      const result = await service.runReview(
        {
          taskLabel: "Task",
          taskDescription: "Description",
          diff: "diff content",
          filesChanged: ["file.ts"],
          focusAreas: ["bug"] as ReviewFindingType[],
        },
        true
      );

      expect(result.summary).toBe("Code looks good");
      expect(result.overallRating).toBe("pass");
    });

    it("should fallback to claude when codex unavailable", async () => {
      // codex not available
      mockExec.mockRejectedValueOnce(new Error("not found"));
      // claude available for fallback check
      mockExec.mockResolvedValueOnce({ stdout: "claude v1.0" });
      // reviewWithClaude
      mockExec.mockResolvedValueOnce({
        stdout: JSON.stringify({
          summary: "Reviewed with Claude",
          overallRating: "needs_work",
          findings: [
            {
              type: "bug",
              severity: "medium",
              filePath: "file.ts",
              description: "Potential issue",
            },
          ],
          suggestedActions: ["Fix the bug"],
        }),
      });

      const result = await service.runReview(
        {
          taskLabel: "Task",
          taskDescription: "Description",
          diff: "diff",
          filesChanged: ["file.ts"],
          focusAreas: ["bug"] as ReviewFindingType[],
        },
        true
      );

      expect(result.summary).toBe("Reviewed with Claude");
      expect(result.findings).toHaveLength(1);
    });

    it("should return error result when no provider available", async () => {
      mockExec.mockRejectedValue(new Error("not found"));

      const result = await service.runReview(
        {
          taskLabel: "Task",
          taskDescription: "Description",
          diff: "diff",
          filesChanged: [],
          focusAreas: [],
        },
        true
      );

      expect(result.overallRating).toBe("needs_work");
      expect(result.suggestedActions).toContain("Install Codex CLI: npm install -g @openai/codex");
    });
  });

  describe("formatReviewForDisplay", () => {
    it("should format review result for display", () => {
      const result = {
        summary: "Found some issues",
        overallRating: "needs_work" as const,
        findings: [
          {
            type: "bug" as const,
            severity: "high" as const,
            filePath: "file.ts",
            lineNumber: 42,
            description: "Null pointer",
            suggestion: "Add null check",
          },
        ],
        suggestedActions: ["Fix bugs", "Add tests"],
        filesReviewed: ["file.ts"],
        linesReviewed: 100,
        reviewDuration: 5.5,
        reviewedAt: "2024-01-01T00:00:00Z",
      };

      const formatted = service.formatReviewForDisplay(result);

      expect(formatted).toContain("Code Review");
      expect(formatted).toContain("needs_work");
      expect(formatted).toContain("Found some issues");
      expect(formatted).toContain("HIGH");
      expect(formatted).toContain("file.ts:42");
      expect(formatted).toContain("Null pointer");
      expect(formatted).toContain("Fix bugs");
      expect(formatted).toContain("5.5s");
    });

    it("should show pass rating correctly", () => {
      const result = {
        summary: "All good",
        overallRating: "pass" as const,
        findings: [],
        suggestedActions: [],
        filesReviewed: [],
        linesReviewed: 0,
        reviewDuration: 1,
        reviewedAt: "2024-01-01",
      };

      const formatted = service.formatReviewForDisplay(result);

      expect(formatted).toContain("pass");
    });

    it("should sort findings by severity", () => {
      const result = {
        summary: "Issues found",
        overallRating: "critical_issues" as const,
        findings: [
          {
            type: "bug" as const,
            severity: "low" as const,
            filePath: "a.ts",
            description: "Low issue",
          },
          {
            type: "security" as const,
            severity: "critical" as const,
            filePath: "b.ts",
            description: "Critical issue",
          },
          {
            type: "performance" as const,
            severity: "high" as const,
            filePath: "c.ts",
            description: "High issue",
          },
        ],
        suggestedActions: [],
        filesReviewed: [],
        linesReviewed: 0,
        reviewDuration: 1,
        reviewedAt: "2024-01-01",
      };

      const formatted = service.formatReviewForDisplay(result);

      // Critical should appear before high, high before low
      const criticalIndex = formatted.indexOf("CRITICAL");
      const highIndex = formatted.indexOf("HIGH");
      const lowIndex = formatted.indexOf("LOW");

      expect(criticalIndex).toBeLessThan(highIndex);
      expect(highIndex).toBeLessThan(lowIndex);
    });
  });
});
