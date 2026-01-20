import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { CLIDetectionResult } from "../types/cli.js";
import { CLIDetectionService } from "./cliDetectionService.js";

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

describe("CLIDetectionService", () => {
  let service: CLIDetectionService;

  beforeEach(() => {
    service = new CLIDetectionService();
    mockExec.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("detectCLI", () => {
    it("should detect claude CLI when available", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "/usr/local/bin/claude\n" });
      mockExec.mockResolvedValueOnce({ stdout: "claude v1.0.0\n" });

      const result = await service.detectCLI("claude");

      expect(result.name).toBe("claude");
      expect(result.available).toBe(true);
      expect(result.executablePath).toBe("/usr/local/bin/claude");
      expect(result.version).toBe("1.0.0");
    });

    it("should detect codex CLI when available", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "/usr/local/bin/codex\n" });
      mockExec.mockResolvedValueOnce({ stdout: "codex 0.5.0\n" });

      const result = await service.detectCLI("codex");

      expect(result.name).toBe("codex");
      expect(result.available).toBe(true);
      expect(result.executablePath).toBe("/usr/local/bin/codex");
      expect(result.version).toBe("0.5.0");
    });

    it("should return unavailable when CLI is not found", async () => {
      mockExec.mockRejectedValueOnce(new Error("command not found"));

      const result = await service.detectCLI("claude");

      expect(result.name).toBe("claude");
      expect(result.available).toBe(false);
      expect(result.executablePath).toBe("claude");
    });

    it("should use custom executable path when provided", async () => {
      const customPath = "/custom/path/claude";
      mockExec.mockResolvedValueOnce({ stdout: `${customPath}\n` });
      mockExec.mockResolvedValueOnce({ stdout: "1.2.3\n" });

      const result = await service.detectCLI("claude", customPath);

      expect(result.executablePath).toBe(customPath);
    });

    it("should handle version detection failure gracefully", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "/usr/local/bin/claude\n" });
      mockExec.mockRejectedValueOnce(new Error("version error"));

      const result = await service.detectCLI("claude");

      expect(result.available).toBe(true);
      expect(result.version).toBeUndefined();
    });
  });

  describe("detectAllCLIs", () => {
    it("should detect all CLIs in parallel", async () => {
      // Use mockImplementation to handle parallel calls properly
      mockExec.mockImplementation((cmd: string) => {
        if (cmd.includes("which claude") || cmd.includes("where claude")) {
          return Promise.resolve({ stdout: "/usr/bin/claude\n" });
        }
        if (cmd.includes("claude --version")) {
          return Promise.resolve({ stdout: "1.0.0\n" });
        }
        // Codex and cursor not available
        return Promise.reject(new Error("not found"));
      });

      const results = await service.detectAllCLIs();

      expect(results).toHaveLength(3);
      const claude = results.find((r: CLIDetectionResult) => r.name === "claude");
      const codex = results.find((r: CLIDetectionResult) => r.name === "codex");
      const cursor = results.find((r: CLIDetectionResult) => r.name === "cursor");

      expect(claude?.available).toBe(true);
      expect(codex?.available).toBe(false);
      expect(cursor?.available).toBe(false);
    });

    it("should cache results", async () => {
      mockExec.mockImplementation((cmd: string) => {
        if (cmd.includes("which claude") || cmd.includes("where claude")) {
          return Promise.resolve({ stdout: "/usr/bin/claude\n" });
        }
        if (cmd.includes("claude --version")) {
          return Promise.resolve({ stdout: "1.0.0\n" });
        }
        return Promise.reject(new Error("not found"));
      });

      // First call - should execute detection
      await service.detectAllCLIs();

      // Second call - should use cache
      const results = await service.detectAllCLIs();

      // Should still have results (from cache)
      expect(results).toHaveLength(3);
    });

    it("should force refresh when requested", async () => {
      let versionCallCount = 0;

      mockExec.mockImplementation((cmd: string) => {
        if (cmd.includes("which claude") || cmd.includes("where claude")) {
          return Promise.resolve({ stdout: "/usr/bin/claude\n" });
        }
        if (cmd.includes("claude --version")) {
          versionCallCount++;
          // Return different version on second detection
          const version = versionCallCount > 1 ? "2.0.0" : "1.0.0";
          return Promise.resolve({ stdout: `${version}\n` });
        }
        return Promise.reject(new Error("not found"));
      });

      await service.detectAllCLIs();

      // Second detection with force refresh
      const results = await service.detectAllCLIs(true);

      const claude = results.find((r: CLIDetectionResult) => r.name === "claude");
      expect(claude?.version).toBe("2.0.0");
    });
  });

  describe("getCLIAvailabilityStatus", () => {
    it("should return status with auto-selected provider", async () => {
      mockExec.mockImplementation((cmd: string) => {
        if (cmd.includes("which claude") || cmd.includes("where claude")) {
          return Promise.resolve({ stdout: "/usr/bin/claude\n" });
        }
        if (cmd.includes("claude --version")) {
          return Promise.resolve({ stdout: "1.0.0\n" });
        }
        if (cmd.includes("which codex") || cmd.includes("where codex")) {
          return Promise.resolve({ stdout: "/usr/bin/codex\n" });
        }
        if (cmd.includes("codex --version")) {
          return Promise.resolve({ stdout: "0.5.0\n" });
        }
        return Promise.reject(new Error("not found"));
      });

      const status = await service.getCLIAvailabilityStatus("auto");

      expect(status.hasAvailableCLI).toBe(true);
      expect(status.selectedProvider).toBe("claude"); // First in preference order
      expect(status.selectionMode).toBe("auto");
    });

    it("should select specific provider when specified", async () => {
      mockExec.mockImplementation((cmd: string) => {
        if (cmd.includes("which claude") || cmd.includes("where claude")) {
          return Promise.resolve({ stdout: "/usr/bin/claude\n" });
        }
        if (cmd.includes("claude --version")) {
          return Promise.resolve({ stdout: "1.0.0\n" });
        }
        if (cmd.includes("which codex") || cmd.includes("where codex")) {
          return Promise.resolve({ stdout: "/usr/bin/codex\n" });
        }
        if (cmd.includes("codex --version")) {
          return Promise.resolve({ stdout: "0.5.0\n" });
        }
        return Promise.reject(new Error("not found"));
      });

      const status = await service.getCLIAvailabilityStatus("codex");

      expect(status.selectedProvider).toBe("codex");
    });

    it("should fallback to auto when specified CLI is not available", async () => {
      mockExec.mockImplementation((cmd: string) => {
        if (cmd.includes("which claude") || cmd.includes("where claude")) {
          return Promise.resolve({ stdout: "/usr/bin/claude\n" });
        }
        if (cmd.includes("claude --version")) {
          return Promise.resolve({ stdout: "1.0.0\n" });
        }
        // Codex and cursor not available
        return Promise.reject(new Error("not found"));
      });

      const status = await service.getCLIAvailabilityStatus("codex");

      // Should fallback to claude (first available)
      expect(status.selectedProvider).toBe("claude");
    });

    it("should return error when no CLI is available", async () => {
      mockExec.mockRejectedValue(new Error("not found"));

      const status = await service.getCLIAvailabilityStatus("auto");

      expect(status.hasAvailableCLI).toBe(false);
      expect(status.selectedProvider).toBe(null);
      expect(status.error).toContain("No CLI available");
    });
  });

  describe("clearCache", () => {
    it("should clear cached results", async () => {
      // First detection
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/claude\n" });
      mockExec.mockResolvedValueOnce({ stdout: "1.0.0\n" });
      mockExec.mockRejectedValueOnce(new Error("not found"));
      mockExec.mockRejectedValueOnce(new Error("not found"));

      await service.detectAllCLIs();

      // Clear cache
      service.clearCache();

      // Should have no cached results
      expect(service.getCachedResult("claude")).toBeUndefined();
    });
  });

  describe("getCachedResult", () => {
    it("should return cached result for detected CLI", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/claude\n" });
      mockExec.mockResolvedValueOnce({ stdout: "1.0.0\n" });
      mockExec.mockRejectedValueOnce(new Error("not found"));
      mockExec.mockRejectedValueOnce(new Error("not found"));

      await service.detectAllCLIs();

      const cached = service.getCachedResult("claude");
      expect(cached).toBeDefined();
      expect(cached?.name).toBe("claude");
      expect(cached?.available).toBe(true);
    });

    it("should return undefined for never-detected CLI", () => {
      const cached = service.getCachedResult("claude");
      expect(cached).toBeUndefined();
    });
  });
});
