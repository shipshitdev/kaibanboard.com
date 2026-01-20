import { vi } from "vitest";

// Mock chokidar file watcher
vi.mock("chokidar", () => ({
  watch: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    close: vi.fn(),
  })),
}));

// Mock child_process
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  spawn: vi.fn(() => ({
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  })),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => fn),
}));
