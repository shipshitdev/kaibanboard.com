import { describe, expect, it, type Mock, vi } from "vitest";
import * as vscode from "vscode";
import { SkillService } from "./skillService";

describe("SkillService", () => {
  it("reads skill settings from configuration", () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === "useAgentFolderInit") return true;
        if (key === "useTaskPrdCreator") return false;
        if (key === "useSessionDocumenter") return true;
        return defaultValue;
      }),
    } as unknown as vscode.WorkspaceConfiguration);

    const service = new SkillService();
    const settings = service.getSettings();

    expect(settings).toEqual({
      useAgentFolderInit: true,
      useTaskPrdCreator: false,
      useSessionDocumenter: true,
    });
  });

  it("runs agent-folder-init via Claude CLI", async () => {
    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    } as unknown as vscode.Terminal;

    vi.mocked(vscode.window.createTerminal).mockReturnValue(terminal);
    vi.mocked(vscode.workspace.getConfiguration).mockImplementation((section) => {
      if (section === "kaiban.claude") {
        return {
          get: vi.fn((key: string, defaultValue?: unknown) => {
            if (key === "executablePath") return "claude";
            if (key === "additionalFlags") return "--flag";
            return defaultValue;
          }),
        } as unknown as vscode.WorkspaceConfiguration;
      }

      return {
        get: vi.fn().mockReturnValue(undefined),
      } as unknown as vscode.WorkspaceConfiguration;
    });

    vi.mocked(vscode.workspace).workspaceFolders = [
      { uri: { fsPath: "/workspace" } },
    ] as unknown as readonly vscode.WorkspaceFolder[];

    const service = new SkillService();
    const result = await service.runAgentFolderInit("My Project");

    expect(result).toBe(terminal);
    expect(vscode.window.createTerminal).toHaveBeenCalledWith({
      name: "Agent Folder Init",
      cwd: "/workspace",
    });
    const sent = (terminal.sendText as Mock).mock.calls[0][0] as string;
    expect(sent).toContain("claude --flag");
    expect(sent).toContain('/shipshitdev-full:agent-folder-init "My Project"');
  });

  it("runs task-prd-creator with escaped prompt", async () => {
    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    } as unknown as vscode.Terminal;

    vi.mocked(vscode.window.createTerminal).mockReturnValue(terminal);
    vi.mocked(vscode.workspace.getConfiguration).mockImplementation((section) => {
      if (section === "kaiban.claude") {
        return {
          get: vi.fn((key: string, defaultValue?: unknown) => {
            if (key === "executablePath") return "claude";
            if (key === "additionalFlags") return "";
            return defaultValue;
          }),
        } as unknown as vscode.WorkspaceConfiguration;
      }

      return {
        get: vi.fn().mockReturnValue(undefined),
      } as unknown as vscode.WorkspaceConfiguration;
    });

    vi.mocked(vscode.workspace).workspaceFolders = [
      { uri: { fsPath: "/workspace" } },
    ] as unknown as readonly vscode.WorkspaceFolder[];

    const service = new SkillService();
    await service.runTaskPrdCreator({
      title: 'Fix "Quotes" $var',
      description: "Line 1\nLine 2",
      category: "Bug",
      taskPath: "/workspace/.agent/TASKS/task.md",
      prdPath: "/workspace/.agent/PRDS/prd.md",
    });

    const sent = (terminal.sendText as Mock).mock.calls[0][0] as string;
    expect(sent).toContain("claude");
    expect(sent).toContain('\\"');
    expect(sent).toContain("\\$");
    expect(sent).toContain("\\n");
  });

  it("runs session-documenter via Claude CLI", async () => {
    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    } as unknown as vscode.Terminal;

    vi.mocked(vscode.window.createTerminal).mockReturnValue(terminal);
    vi.mocked(vscode.workspace.getConfiguration).mockImplementation((section) => {
      if (section === "kaiban.claude") {
        return {
          get: vi.fn((key: string, defaultValue?: unknown) => {
            if (key === "executablePath") return "claude";
            if (key === "additionalFlags") return "";
            return defaultValue;
          }),
        } as unknown as vscode.WorkspaceConfiguration;
      }

      return {
        get: vi.fn().mockReturnValue(undefined),
      } as unknown as vscode.WorkspaceConfiguration;
    });

    vi.mocked(vscode.workspace).workspaceFolders = [
      { uri: { fsPath: "/workspace" } },
    ] as unknown as readonly vscode.WorkspaceFolder[];

    const service = new SkillService();
    await service.runSessionDocumenter("Ship it");

    const sent = (terminal.sendText as Mock).mock.calls[0][0] as string;
    expect(sent).toContain('/shipshitdev-full:end "Ship it"');
  });
});
