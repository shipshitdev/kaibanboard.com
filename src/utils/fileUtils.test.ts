import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import * as fs from "node:fs";
import * as path from "node:path";
import {
  createFile,
  ensureDirectoryExists,
  generateUniqueFileName,
  getPRDBasePath,
  getRelativePRDPath,
  getTasksBasePath,
  getWorkspaceFolder,
  slugify,
} from "./fileUtils";

describe("fileUtils", () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.mkdirSync).mockReset();
    vi.mocked(fs.writeFileSync).mockReset();
  });

  it("slugify creates URL-safe slugs", () => {
    expect(slugify(" Hello, World! ")).toBe("hello-world");
    expect(slugify("Multiple__spaces")).toBe("multiple-spaces");
  });

  it("getWorkspaceFolder returns the first workspace folder", () => {
    vi.mocked(vscode.workspace).workspaceFolders = undefined;
    expect(getWorkspaceFolder()).toBeUndefined();

    vi.mocked(vscode.workspace).workspaceFolders = [
      { uri: { fsPath: "/workspace" } },
      { uri: { fsPath: "/workspace2" } },
    ] as unknown as readonly vscode.WorkspaceFolder[];

    expect(getWorkspaceFolder()?.uri.fsPath).toBe("/workspace");
  });

  it("ensureDirectoryExists creates a directory when missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await ensureDirectoryExists("/tmp/new-dir");

    expect(fs.mkdirSync).toHaveBeenCalledWith("/tmp/new-dir", { recursive: true });
  });

  it("ensureDirectoryExists does nothing when directory exists", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await ensureDirectoryExists("/tmp/existing");

    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it("getPRDBasePath resolves configured base path", () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
      get: vi.fn().mockReturnValue("custom/PRDS"),
    } as unknown as vscode.WorkspaceConfiguration);

    const workspaceFolder = { uri: { fsPath: "/workspace" } } as vscode.WorkspaceFolder;

    expect(getPRDBasePath(workspaceFolder)).toBe(path.join("/workspace", "custom/PRDS"));
  });

  it("getTasksBasePath resolves .agent/TASKS", () => {
    const workspaceFolder = { uri: { fsPath: "/workspace" } } as vscode.WorkspaceFolder;

    expect(getTasksBasePath(workspaceFolder)).toBe(path.join("/workspace", ".agent", "TASKS"));
  });

  it("generateUniqueFileName appends a counter when needed", () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true).mockReturnValueOnce(false);

    const fileName = generateUniqueFileName("/base", "file", ".md");

    expect(fileName).toBe("file-1.md");
  });

  it("getRelativePRDPath returns a normalized relative path", () => {
    const relative = getRelativePRDPath(
      "/workspace/.agent/TASKS/task.md",
      "/workspace/.agent/PRDS/prd.md"
    );

    expect(relative).toBe("../PRDS/prd.md");
  });

  it("createFile writes content after ensuring the directory", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await createFile("/workspace/.agent/PRDS/prd.md", "content");

    expect(fs.mkdirSync).toHaveBeenCalledWith("/workspace/.agent/PRDS", { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/workspace/.agent/PRDS/prd.md",
      "content",
      "utf-8"
    );
  });
});
