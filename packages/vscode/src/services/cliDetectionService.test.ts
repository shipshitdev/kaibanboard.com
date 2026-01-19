import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIDetectionService } from "./cliDetectionService";

// Mock child_process
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => fn),
}));

describe("CLIDetectionService", () => {
  let service: CLIDetectionService;
  let mockExec: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new CLIDetectionService();

    // Get the mocked exec function
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const childProcess = require("node:child_process") as any;
    mockExec = childProcess.exec;
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
  });

  describe("detectAllCLIs", () => {
    it("should detect all CLIs in parallel", async () => {
      // Claude available
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/claude\n" });
      mockExec.mockResolvedValueOnce({ stdout: "1.0.0\n" });
      // Codex not available
      mockExec.mockRejectedValueOnce(new Error("not found"));
      // Cursor not available
      mockExec.mockRejectedValueOnce(new Error("not found"));

      const results = await service.detectAllCLIs();

      expect(results).toHaveLength(3);
      const claude = results.find((r) => r.name === "claude");
      const codex = results.find((r) => r.name === "codex");
      const cursor = results.find((r) => r.name === "cursor");

      expect(claude?.available).toBe(true);
      expect(codex?.available).toBe(false);
      expect(cursor?.available).toBe(false);
    });

    it("should cache results", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/claude\n" });
      mockExec.mockResolvedValueOnce({ stdout: "1.0.0\n" });
      mockExec.mockRejectedValueOnce(new Error("not found"));
      mockExec.mockRejectedValueOnce(new Error("not found"));

      // First call - should execute detection
      await service.detectAllCLIs();

      // Second call - should use cache
      const results = await service.detectAllCLIs();

      // Should still have results (from cache)
      expect(results).toHaveLength(3);
    });

    it("should force refresh when requested", async () => {
      // First detection
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/claude\n" });
      mockExec.mockResolvedValueOnce({ stdout: "1.0.0\n" });
      mockExec.mockRejectedValueOnce(new Error("not found"));
      mockExec.mockRejectedValueOnce(new Error("not found"));

      await service.detectAllCLIs();

      // Second detection with force refresh
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/claude\n" });
      mockExec.mockResolvedValueOnce({ stdout: "2.0.0\n" });
      mockExec.mockRejectedValueOnce(new Error("not found"));
      mockExec.mockRejectedValueOnce(new Error("not found"));

      const results = await service.detectAllCLIs(true);

      const claude = results.find((r) => r.name === "claude");
      expect(claude?.version).toBe("2.0.0");
    });
  });

  describe("getCLIAvailabilityStatus", () => {
    it("should return status with auto-selected provider", async () => {
      // Claude available
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/claude\n" });
      mockExec.mockResolvedValueOnce({ stdout: "1.0.0\n" });
      // Codex available
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/codex\n" });
      mockExec.mockResolvedValueOnce({ stdout: "0.5.0\n" });
      // Cursor not available
      mockExec.mockRejectedValueOnce(new Error("not found"));

      const status = await service.getCLIAvailabilityStatus("auto");

      expect(status.hasAvailableCLI).toBe(true);
      expect(status.selectedProvider).toBe("claude"); // First in preference order
      expect(status.selectionMode).toBe("auto");
    });

    it("should select specific provider when specified", async () => {
      // Claude available
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/claude\n" });
      mockExec.mockResolvedValueOnce({ stdout: "1.0.0\n" });
      // Codex available
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/codex\n" });
      mockExec.mockResolvedValueOnce({ stdout: "0.5.0\n" });
      // Cursor not available
      mockExec.mockRejectedValueOnce(new Error("not found"));

      const status = await service.getCLIAvailabilityStatus("codex");

      expect(status.selectedProvider).toBe("codex");
    });

    it("should fallback to auto when specified CLI is not available", async () => {
      // Claude available
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/claude\n" });
      mockExec.mockResolvedValueOnce({ stdout: "1.0.0\n" });
      // Codex not available
      mockExec.mockRejectedValueOnce(new Error("not found"));
      // Cursor not available
      mockExec.mockRejectedValueOnce(new Error("not found"));

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

  describe("getCLIConfig", () => {
    it("should return config with defaults", () => {
      const mockVscodeConfig = {
        get: vi.fn().mockImplementation((_key: string, defaultValue: unknown) => defaultValue),
      };

      const config = service.getCLIConfig("claude", mockVscodeConfig);

      expect(config.name).toBe("claude");
      expect(config.executablePath).toBe("claude");
      expect(config.supportsRalphLoop).toBe(true);
    });

    it("should return config with custom values", () => {
      const mockVscodeConfig = {
        get: vi.fn().mockImplementation((key: string, defaultValue: unknown) => {
          if (key === "claude.executablePath") return "/custom/claude";
          if (key === "claude.additionalFlags") return "--verbose";
          return defaultValue;
        }),
      };

      const config = service.getCLIConfig("claude", mockVscodeConfig);

      expect(config.executablePath).toBe("/custom/claude");
      expect(config.additionalFlags).toBe("--verbose");
    });

    it("should mark codex as not supporting ralph-loop", () => {
      const mockVscodeConfig = {
        get: vi.fn().mockImplementation((_key: string, defaultValue: unknown) => defaultValue),
      };

      const config = service.getCLIConfig("codex", mockVscodeConfig);

      expect(config.supportsRalphLoop).toBe(false);
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
});
