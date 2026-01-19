import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIMergeService } from "./aiMergeService";

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

describe("AIMergeService", () => {
  let service: AIMergeService;
  let mockExec: ReturnType<typeof vi.fn>;

  const workspacePath = "/test/workspace";

  beforeEach(() => {
    service = new AIMergeService(workspacePath);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const childProcess = require("node:child_process") as any;
    mockExec = childProcess.exec;
    mockExec.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("buildMergePrompt", () => {
    it("should build prompt with task context", () => {
      const context = {
        taskLabel: "Fix authentication",
        taskDescription: "Fix login bug",
        conflicts: [
          {
            filePath: "auth.ts",
            conflicts: [
              {
                filePath: "auth.ts",
                ours: "const a = 1;",
                theirs: "const a = 2;",
                startLine: 10,
                endLine: 15,
              },
            ],
            rawContent: "file content",
          },
        ],
      };

      const prompt = service.buildMergePrompt(context);

      expect(prompt).toContain("Fix authentication");
      expect(prompt).toContain("Fix login bug");
      expect(prompt).toContain("auth.ts");
      expect(prompt).toContain("const a = 1;");
      expect(prompt).toContain("const a = 2;");
      expect(prompt).toContain("JSON");
    });

    it("should include PRD content when provided", () => {
      const context = {
        taskLabel: "Feature",
        taskDescription: "Description",
        prdContent: "## Requirements\n- Requirement 1",
        conflicts: [],
      };

      const prompt = service.buildMergePrompt(context);

      expect(prompt).toContain("PRD Context");
      expect(prompt).toContain("Requirements");
    });
  });

  describe("isClaudeAvailable", () => {
    it("should return true when claude is available", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "claude v1.0.0" });

      const result = await service.isClaudeAvailable();

      expect(result).toBe(true);
    });

    it("should return false when claude is not available", async () => {
      mockExec.mockRejectedValueOnce(new Error("command not found"));

      const result = await service.isClaudeAvailable();

      expect(result).toBe(false);
    });
  });

  describe("isCodexAvailable", () => {
    it("should return true when codex is available", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "codex 0.5.0" });

      const result = await service.isCodexAvailable();

      expect(result).toBe(true);
    });

    it("should return false when codex is not available", async () => {
      mockExec.mockRejectedValueOnce(new Error("command not found"));

      const result = await service.isCodexAvailable();

      expect(result).toBe(false);
    });
  });

  describe("getBestProvider", () => {
    it("should prefer claude when available", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "claude v1.0.0" });

      const result = await service.getBestProvider();

      expect(result).toBe("claude");
    });

    it("should fallback to codex when claude unavailable", async () => {
      mockExec.mockRejectedValueOnce(new Error("not found")); // claude
      mockExec.mockResolvedValueOnce({ stdout: "codex 0.5.0" }); // codex

      const result = await service.getBestProvider();

      expect(result).toBe("codex");
    });

    it("should return null when no provider available", async () => {
      mockExec.mockRejectedValue(new Error("not found"));

      const result = await service.getBestProvider();

      expect(result).toBeNull();
    });
  });

  describe("resolveConflicts", () => {
    it("should return error when no provider available", async () => {
      mockExec.mockRejectedValue(new Error("not found"));

      const result = await service.resolveConflicts({
        taskLabel: "Task",
        taskDescription: "Description",
        conflicts: [
          {
            filePath: "file.ts",
            conflicts: [],
            rawContent: "",
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No AI provider available");
    });

    it("should use claude when available", async () => {
      // getBestProvider - claude available
      mockExec.mockResolvedValueOnce({ stdout: "claude v1.0.0" });
      // resolveWithClaude
      mockExec.mockResolvedValueOnce({
        stdout: JSON.stringify({
          resolutions: [
            {
              filePath: "file.ts",
              resolvedContent: "resolved",
              confidence: "high",
              explanation: "merged both",
              needsReview: false,
            },
          ],
          summary: "Resolved 1 conflict",
        }),
      });

      const result = await service.resolveConflicts({
        taskLabel: "Task",
        taskDescription: "Description",
        conflicts: [
          {
            filePath: "file.ts",
            conflicts: [
              {
                filePath: "file.ts",
                ours: "a",
                theirs: "b",
                startLine: 1,
                endLine: 5,
              },
            ],
            rawContent: "content",
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.resolutions).toHaveLength(1);
      expect(result.summary).toBe("Resolved 1 conflict");
    });
  });

  describe("applyResolutions", () => {
    it("should apply resolutions to files", async () => {
      const resolutions = [
        {
          filePath: "file.ts",
          resolvedContent: "resolved content",
          confidence: "high" as const,
          explanation: "merged",
          needsReview: false,
        },
      ];

      const conflicts = [
        {
          filePath: "file.ts",
          conflicts: [
            {
              filePath: "file.ts",
              ours: "a",
              theirs: "b",
              startLine: 1,
              endLine: 5,
            },
          ],
          rawContent: "raw",
        },
      ];

      const result = await service.applyResolutions(resolutions, conflicts);

      expect(result.appliedCount).toBe(1);
      expect(result.success).toBe(true);
    });

    it("should report errors for missing conflict files", async () => {
      const resolutions = [
        {
          filePath: "missing.ts",
          resolvedContent: "content",
          confidence: "high" as const,
          explanation: "merged",
          needsReview: false,
        },
      ];

      const result = await service.applyResolutions(resolutions, []);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("No conflict found for missing.ts");
    });
  });
});
