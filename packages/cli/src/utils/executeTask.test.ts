import type { Task } from "@kaibanboard/core";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Use vi.hoisted to create mock that's available at hoist time
const mockCLIServiceInstance = vi.hoisted(() => ({
  getCLIAvailabilityStatus: vi.fn(),
  detectCLI: vi.fn(),
  detectAllCLIs: vi.fn(),
  clearCache: vi.fn(),
  getCachedResult: vi.fn(),
}));

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => fn),
}));

// Mock fs module for CoreTaskParser
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

// Mock the CLIDetectionService as a class
vi.mock("../services/cliDetectionService.js", () => {
  return {
    CLIDetectionService: class MockCLIDetectionService {
      getCLIAvailabilityStatus = mockCLIServiceInstance.getCLIAvailabilityStatus;
      detectCLI = mockCLIServiceInstance.detectCLI;
      detectAllCLIs = mockCLIServiceInstance.detectAllCLIs;
      clearCache = mockCLIServiceInstance.clearCache;
      getCachedResult = mockCLIServiceInstance.getCachedResult;
    },
  };
});

// Use vi.hoisted for CoreTaskParser mock too
const mockCoreTaskParserInstance = vi.hoisted(() => ({
  updateTaskStatus: vi.fn(),
  parseTasks: vi.fn().mockReturnValue([]),
  groupByStatus: vi.fn(),
  getTask: vi.fn(),
}));

// Mock CoreTaskParser
vi.mock("@kaibanboard/core", () => ({
  CoreTaskParser: class MockCoreTaskParser {
    updateTaskStatus = mockCoreTaskParserInstance.updateTaskStatus;
    parseTasks = mockCoreTaskParserInstance.parseTasks;
    groupByStatus = mockCoreTaskParserInstance.groupByStatus;
    getTask = mockCoreTaskParserInstance.getTask;
  },
}));

// Import mocked modules after vi.mock
import * as childProcess from "node:child_process";
import { executeTask, getCLIStatus } from "./executeTask.js";

const mockSpawn = childProcess.spawn as unknown as Mock;

describe("executeTask", () => {
  const mockTask: Task = {
    id: "task-001",
    label: "Test Task",
    description: "A test task",
    type: "Feature",
    status: "Backlog",
    priority: "High",
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-01T00:00:00Z",
    prdPath: ".agent/PRDS/test.md",
    filePath: "/workspace/.agent/TASKS/task-001.md",
    completed: false,
    project: "test-project",
    claimedBy: "",
    claimedAt: "",
    completedAt: "",
    rejectionCount: 0,
    agentNotes: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReset();

    // Setup default CLI service mock - update implementations, don't reassign
    mockCLIServiceInstance.getCLIAvailabilityStatus.mockResolvedValue({
      hasAvailableCLI: true,
      selectedProvider: "claude",
      selectionMode: "auto",
      clis: [{ name: "claude", available: true, executablePath: "claude" }],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return error when no CLI is available", async () => {
    mockCLIServiceInstance.getCLIAvailabilityStatus.mockResolvedValue({
      hasAvailableCLI: false,
      selectedProvider: null,
      selectionMode: "auto",
      clis: [],
      error: "No CLI available",
    });

    const result = await executeTask(mockTask, "/workspace");

    expect(result.success).toBe(false);
    expect(result.error).toContain("No CLI available");
  });

  it("should spawn CLI process with correct arguments", async () => {
    let closeHandler: ((code: number) => void) | undefined;

    mockSpawn.mockReturnValue({
      on: vi.fn((event: string, handler: (arg: unknown) => void) => {
        if (event === "close") {
          closeHandler = handler as (code: number) => void;
          // Simulate successful close after brief delay
          setTimeout(() => closeHandler?.(0), 10);
        }
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    });

    const resultPromise = executeTask(mockTask, "/workspace");

    const result = await resultPromise;

    expect(mockSpawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining([expect.stringContaining(mockTask.filePath)]),
      expect.objectContaining({
        cwd: "/workspace",
        shell: true,
      })
    );
    expect(result.success).toBe(true);
  });

  it("should return error when CLI process fails", async () => {
    let closeHandler: ((code: number) => void) | undefined;

    mockSpawn.mockReturnValue({
      on: vi.fn((event: string, handler: (arg: unknown) => void) => {
        if (event === "close") {
          closeHandler = handler as (code: number) => void;
          setTimeout(() => closeHandler?.(1), 10);
        }
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    });

    const result = await executeTask(mockTask, "/workspace");

    expect(result.success).toBe(false);
    expect(result.error).toContain("exited with code 1");
  });

  it("should return error when spawn throws", async () => {
    let errorHandler: ((error: Error) => void) | undefined;

    mockSpawn.mockReturnValue({
      on: vi.fn((event: string, handler: (arg: unknown) => void) => {
        if (event === "error") {
          errorHandler = handler as (error: Error) => void;
          setTimeout(() => errorHandler?.(new Error("spawn error")), 10);
        }
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    });

    const result = await executeTask(mockTask, "/workspace");

    expect(result.success).toBe(false);
    expect(result.error).toBe("spawn error");
  });

  it("should use specified CLI provider when provided", async () => {
    mockCLIServiceInstance.getCLIAvailabilityStatus.mockResolvedValue({
      hasAvailableCLI: true,
      selectedProvider: "codex",
      selectionMode: "codex",
      clis: [{ name: "codex", available: true, executablePath: "codex" }],
    });

    let closeHandler: ((code: number) => void) | undefined;

    mockSpawn.mockReturnValue({
      on: vi.fn((event: string, handler: (arg: unknown) => void) => {
        if (event === "close") {
          closeHandler = handler as (code: number) => void;
          setTimeout(() => closeHandler?.(0), 10);
        }
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    });

    await executeTask(mockTask, "/workspace", "codex");

    expect(mockCLIServiceInstance.getCLIAvailabilityStatus).toHaveBeenCalledWith("codex");
  });
});

describe("getCLIStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock service instance for getCLIStatus tests - update implementations
    mockCLIServiceInstance.getCLIAvailabilityStatus.mockResolvedValue({
      hasAvailableCLI: true,
      selectedProvider: "claude",
      selectionMode: "auto",
      clis: [{ name: "claude", available: true, executablePath: "claude" }],
    });
    mockCLIServiceInstance.detectCLI.mockResolvedValue({
      name: "claude",
      available: true,
      executablePath: "claude",
      version: "1.2.3",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return CLI status with version", async () => {
    const status = await getCLIStatus();

    expect(status.available).toBe(true);
    expect(status.provider).toBe("claude");
    expect(status.version).toBe("1.2.3");
  });

  it("should return unavailable when no CLI found", async () => {
    mockCLIServiceInstance.getCLIAvailabilityStatus.mockResolvedValue({
      hasAvailableCLI: false,
      selectedProvider: null,
      selectionMode: "auto",
      clis: [],
    });

    const status = await getCLIStatus();

    expect(status.available).toBe(false);
    expect(status.provider).toBe(null);
    expect(status.version).toBeUndefined();
  });
});
