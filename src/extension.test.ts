import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import * as vscode from "vscode";

// Create mock functions at module level
const mockShow = vi.fn();
const mockRefresh = vi.fn();
const mockDispose = vi.fn();

// Mock fs module
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock path module
vi.mock("node:path", () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join("/")),
    basename: vi.fn((p: string) => p.split("/").pop() ?? ""),
    dirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/") || "."),
  },
  join: vi.fn((...args: string[]) => args.join("/")),
  basename: vi.fn((p: string) => p.split("/").pop() ?? ""),
  dirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/") || "."),
}));

// Mock the KanbanViewProvider before importing extension
vi.mock("./kanbanView", () => ({
  KanbanViewProvider: class {
    show = mockShow;
    refresh = mockRefresh;
    dispose = mockDispose;
  },
}));

// Mock SkillService
const mockGetSettings = vi.fn().mockReturnValue({
  useAgentFolderInit: false,
  useTaskPrdCreator: false,
  useSessionDocumenter: false,
});
const mockRunAgentFolderInit = vi.fn().mockResolvedValue({
  show: vi.fn(),
  sendText: vi.fn(),
} as unknown as vscode.Terminal);

vi.mock("./services/skillService", () => ({
  SkillService: class {
    getSettings = mockGetSettings;
    runAgentFolderInit = mockRunAgentFolderInit;
  },
}));

// Mock fs module
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock path module
vi.mock("node:path", () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join("/")),
    basename: vi.fn((p: string) => p.split("/").pop() ?? ""),
    dirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/") || "."),
  },
  join: vi.fn((...args: string[]) => args.join("/")),
  basename: vi.fn((p: string) => p.split("/").pop() ?? ""),
  dirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/") || "."),
}));

// Import extension after mocking
import { activate, deactivate } from "./extension";

describe("extension", () => {
  let mockContext: vscode.ExtensionContext;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockContext = {
      subscriptions: [],
      secrets: {
        get: vi.fn().mockResolvedValue(undefined),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        onDidChange: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockShow.mockClear().mockResolvedValue(undefined);
    mockRefresh.mockClear().mockResolvedValue(undefined);
    mockDispose.mockClear();
    mockGetSettings.mockClear().mockReturnValue({
      useAgentFolderInit: false,
      useTaskPrdCreator: false,
      useSessionDocumenter: false,
    });
    mockRunAgentFolderInit.mockClear().mockResolvedValue({
      show: vi.fn(),
      sendText: vi.fn(),
    } as unknown as vscode.Terminal);
    // Re-mock showInformationMessage to return a Promise
    (vscode.window.showInformationMessage as Mock).mockResolvedValue(undefined);
    (vscode.window.showErrorMessage as Mock).mockResolvedValue(undefined);
    (vscode.window.showWarningMessage as Mock).mockResolvedValue(undefined);
    (vscode.window.showQuickPick as Mock).mockResolvedValue(undefined);
    (vscode.window.showInputBox as Mock).mockResolvedValue(undefined);
    (vscode.commands.registerCommand as Mock).mockClear();
    (vscode.commands.executeCommand as Mock).mockClear();
    vi.mocked(vscode.env).appName = "Cursor";
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    vi.mocked(path.join).mockImplementation((...args: string[]) => args.join("/"));
    vi.mocked(path.basename).mockImplementation((p: string) => p.split("/").pop() ?? "");
    vi.mocked(path.dirname).mockImplementation((p: string) => p.split("/").slice(0, -1).join("/") || ".");
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("activate", () => {
    it("should log activation message", () => {
      activate(mockContext);
      expect(consoleSpy).toHaveBeenCalledWith("Kaiban Board extension activated");
    });

    it("should abort activation when not running in Cursor", async () => {
      vi.mocked(vscode.env).appName = "VS Code";
      (vscode.window.showErrorMessage as Mock).mockResolvedValue("Download Cursor");

      activate(mockContext);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("requires Cursor IDE"),
        "Download Cursor"
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(vscode.env.openExternal).toHaveBeenCalled();
      const [openedUri] = (vscode.env.openExternal as Mock).mock.calls[0] ?? [];
      expect(openedUri?.toString()).toBe("https://cursor.com");
      expect(vscode.commands.registerCommand).not.toHaveBeenCalled();
    });

    it("should not open external when download is not selected", async () => {
      vi.mocked(vscode.env).appName = "VS Code";
      (vscode.window.showErrorMessage as Mock).mockResolvedValue(undefined);

      activate(mockContext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.env.openExternal).not.toHaveBeenCalled();
      expect(vscode.commands.registerCommand).not.toHaveBeenCalled();
    });

    it("should register kaiban.showBoard command", () => {
      activate(mockContext);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        "kaiban.showBoard",
        expect.any(Function)
      );
    });

    it("should register kaiban.refreshBoard command", () => {
      activate(mockContext);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        "kaiban.refreshBoard",
        expect.any(Function)
      );
    });

    it("should register kaiban.configure command", () => {
      activate(mockContext);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        "kaiban.configure",
        expect.any(Function)
      );
    });

    it("should register kaiban.createPRD command", () => {
      activate(mockContext);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        "kaiban.createPRD",
        expect.any(Function)
      );
    });

    it("should register kaiban.createTask command", () => {
      activate(mockContext);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        "kaiban.createTask",
        expect.any(Function)
      );
    });

    it("should add commands to subscriptions", () => {
      activate(mockContext);
      // 5 commands: showBoard, refreshBoard, configure, createPRD, createTask
      expect(mockContext.subscriptions.length).toBe(5);
    });

    it("should show welcome message with Open Board option", () => {
      activate(mockContext);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Kaiban Board is ready! Use "Kaiban: Show Board" command to open.',
        "Open Board"
      );
    });

    it('should execute showBoard when "Open Board" is selected', async () => {
      (vscode.window.showInformationMessage as Mock).mockResolvedValue("Open Board");
      activate(mockContext);

      // Wait for the promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("kaiban.showBoard");
    });

    it("should not execute showBoard when selection is undefined", async () => {
      (vscode.window.showInformationMessage as Mock).mockResolvedValue(undefined);
      activate(mockContext);

      // Wait for the promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    describe("showBoard command handler", () => {
      it("should call kanbanView.show() on success", async () => {
        mockShow.mockResolvedValue(undefined);

        activate(mockContext);

        // Get the command handler
        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.showBoard"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(mockShow).toHaveBeenCalled();
      });

      it("should show error message when show() fails", async () => {
        mockShow.mockRejectedValue(new Error("Test error"));

        activate(mockContext);

        // Get the command handler
        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.showBoard"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          "Failed to show Kaiban board: Error: Test error"
        );
      });
    });

    describe("refreshBoard command handler", () => {
      it("should call kanbanView.refresh() and show success message", async () => {
        mockRefresh.mockResolvedValue(undefined);

        activate(mockContext);

        // Get the command handler
        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.refreshBoard"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(mockRefresh).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Kaiban board refreshed");
      });

      it("should show error message when refresh() fails", async () => {
        mockRefresh.mockRejectedValue(new Error("Refresh error"));

        activate(mockContext);

        // Get the command handler
        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.refreshBoard"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          "Failed to refresh board: Error: Refresh error"
        );
      });
    });

    describe("configure command handler", () => {
      it("should return when no config option selected", async () => {
        activate(mockContext);
        (vscode.window.showQuickPick as Mock).mockResolvedValue(undefined);

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.configure"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(vscode.window.showInputBox).not.toHaveBeenCalled();
      });

      it("should update columns when selected", async () => {
        activate(mockContext);
        const updateSpy = vi.fn().mockResolvedValue(undefined);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(["To Do"]),
          update: updateSpy,
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/PRDS"),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/TASKS"),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);

        (vscode.window.showQuickPick as Mock).mockResolvedValueOnce({
          option: "columns",
        });
        (vscode.window.showQuickPick as Mock).mockResolvedValueOnce([
          { label: "To Do" },
          { label: "Done" },
        ]);

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.configure"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(updateSpy).toHaveBeenCalledWith(
          "enabled",
          ["To Do", "Done"],
          vscode.ConfigurationTarget.Workspace
        );
        expect(mockRefresh).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "Columns updated: To Do, Done"
        );
      });

      it("should do nothing when column selection is canceled", async () => {
        activate(mockContext);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(["To Do"]),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/PRDS"),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/TASKS"),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);

        (vscode.window.showQuickPick as Mock).mockResolvedValueOnce({
          option: "columns",
        });
        (vscode.window.showQuickPick as Mock).mockResolvedValueOnce(undefined);

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.configure"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
      });

      it("should warn when no columns selected", async () => {
        activate(mockContext);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(["To Do"]),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/PRDS"),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/TASKS"),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);

        (vscode.window.showQuickPick as Mock).mockResolvedValueOnce({
          option: "columns",
        });
        (vscode.window.showQuickPick as Mock).mockResolvedValueOnce([]);

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.configure"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
          "At least one column must be selected."
        );
      });

      it("should update PRD base path", async () => {
        activate(mockContext);
        const updateSpy = vi.fn().mockResolvedValue(undefined);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(["To Do"]),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/PRDS"),
          update: updateSpy,
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/TASKS"),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);

        (vscode.window.showQuickPick as Mock).mockResolvedValueOnce({
          option: "prd",
        });
        (vscode.window.showInputBox as Mock).mockResolvedValue("  docs/prds/  ");

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.configure"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(updateSpy).toHaveBeenCalledWith(
          "basePath",
          "docs/prds",
          vscode.ConfigurationTarget.Workspace
        );
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "PRD base path updated to: docs/prds. Refresh the board to apply changes."
        );

        const validateInput = (vscode.window.showInputBox as Mock).mock.calls[0][0]
          .validateInput as (value: string) => string | null;
        expect(validateInput("")).toBe("Path cannot be empty");
        expect(validateInput("   ")).toBe("Path cannot be empty");
        expect(validateInput("///")).toBe("Invalid path");
        expect(validateInput("docs/prds")).toBeNull();
      });

      it("should not update PRD base path when input is canceled", async () => {
        activate(mockContext);
        const updateSpy = vi.fn().mockResolvedValue(undefined);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(["To Do"]),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/PRDS"),
          update: updateSpy,
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/TASKS"),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);

        (vscode.window.showQuickPick as Mock).mockResolvedValueOnce({
          option: "prd",
        });
        (vscode.window.showInputBox as Mock).mockResolvedValue(undefined);

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.configure"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(updateSpy).not.toHaveBeenCalled();
      });

      it("should update task base path", async () => {
        activate(mockContext);
        const updateSpy = vi.fn().mockResolvedValue(undefined);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(["To Do"]),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/PRDS"),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/TASKS"),
          update: updateSpy,
        } as unknown as vscode.WorkspaceConfiguration);

        (vscode.window.showQuickPick as Mock).mockResolvedValueOnce({
          option: "task",
        });
        (vscode.window.showInputBox as Mock).mockResolvedValue("  docs/tasks/  ");

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.configure"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(updateSpy).toHaveBeenCalledWith(
          "basePath",
          "docs/tasks",
          vscode.ConfigurationTarget.Workspace
        );
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "Task base path updated to: docs/tasks. Refresh the board to apply changes."
        );
      });

      it("should not update task base path when input is canceled", async () => {
        activate(mockContext);
        const updateSpy = vi.fn().mockResolvedValue(undefined);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(["To Do"]),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/PRDS"),
          update: vi.fn(),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          get: vi.fn().mockReturnValue(".agent/TASKS"),
          update: updateSpy,
        } as unknown as vscode.WorkspaceConfiguration);

        (vscode.window.showQuickPick as Mock).mockResolvedValueOnce({
          option: "task",
        });
        (vscode.window.showInputBox as Mock).mockResolvedValue(undefined);

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.configure"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(updateSpy).not.toHaveBeenCalled();
      });
    });

    describe("createPRD command handler", () => {
      it("should show error when no workspace folder", async () => {
        activate(mockContext);
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = undefined;

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.createPRD"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("No workspace folder open");
      });

      it("should create terminal and send command when workspace folder exists", async () => {
        activate(mockContext);
        const mockWorkspaceFolder = {
          uri: { fsPath: "/workspace" },
        } as vscode.WorkspaceFolder;
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = [mockWorkspaceFolder];
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
          get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) => {
            if (key === "claude.executablePath") return "claude";
            if (key === "claude.additionalFlags") return "";
            return defaultValue;
          }),
        } as unknown as vscode.WorkspaceConfiguration);

        const mockTerminal = {
          show: vi.fn(),
          sendText: vi.fn(),
        };
        vi.mocked(vscode.window.createTerminal).mockReturnValue(mockTerminal as unknown as vscode.Terminal);

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.createPRD"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(vscode.window.createTerminal).toHaveBeenCalledWith({
          name: "Claude: Create PRD",
          cwd: "/workspace",
        });
        expect(mockTerminal.show).toHaveBeenCalled();
        expect(mockTerminal.sendText).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "Claude CLI opened - follow the prompts to create your PRD"
        );
      });

      it("should handle errors during PRD creation", async () => {
        activate(mockContext);
        const mockWorkspaceFolder = {
          uri: { fsPath: "/workspace" },
        } as vscode.WorkspaceFolder;
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = [mockWorkspaceFolder];
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
          get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) => {
            if (key === "claude.executablePath") return "claude";
            if (key === "claude.additionalFlags") return "";
            return defaultValue;
          }),
        } as unknown as vscode.WorkspaceConfiguration);
        // Make createTerminal throw an error
        vi.mocked(vscode.window.createTerminal).mockImplementation(() => {
          throw new Error("Test error");
        });

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.createPRD"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to start PRD creation")
        );
      });
    });

    describe("createTask command handler", () => {
      it("should show error when no workspace folder", async () => {
        activate(mockContext);
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = undefined;

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.createTask"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("No workspace folder open");
      });

      it("should create terminal and send command when workspace folder exists", async () => {
        activate(mockContext);
        const mockWorkspaceFolder = {
          uri: { fsPath: "/workspace" },
        } as vscode.WorkspaceFolder;
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = [mockWorkspaceFolder];
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
          get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) => {
            if (key === "claude.executablePath") return "claude";
            if (key === "claude.additionalFlags") return "";
            return defaultValue;
          }),
        } as unknown as vscode.WorkspaceConfiguration);

        const mockTerminal = {
          show: vi.fn(),
          sendText: vi.fn(),
        };
        vi.mocked(vscode.window.createTerminal).mockReturnValue(mockTerminal as unknown as vscode.Terminal);

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.createTask"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(vscode.window.createTerminal).toHaveBeenCalledWith({
          name: "Claude: Create Task",
          cwd: "/workspace",
        });
        expect(mockTerminal.show).toHaveBeenCalled();
        expect(mockTerminal.sendText).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "Claude CLI opened - follow the prompts to create your task"
        );
      });

      it("should handle errors during task creation", async () => {
        activate(mockContext);
        const mockWorkspaceFolder = {
          uri: { fsPath: "/workspace" },
        } as vscode.WorkspaceFolder;
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = [mockWorkspaceFolder];
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
          get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) => {
            if (key === "claude.executablePath") return "claude";
            if (key === "claude.additionalFlags") return "";
            return defaultValue;
          }),
        } as unknown as vscode.WorkspaceConfiguration);
        // Make createTerminal throw an error
        vi.mocked(vscode.window.createTerminal).mockImplementation(() => {
          throw new Error("Test error");
        });

        const registerCommandCall = (vscode.commands.registerCommand as Mock).mock.calls.find(
          (call) => call[0] === "kaiban.createTask"
        );
        const handler = registerCommandCall?.[1];

        await handler();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to start task creation")
        );
      });
    });

    describe("checkAgentFolderInit", () => {
      it("should return early when no workspace folder", async () => {
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = undefined;
        activate(mockContext);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(fs.existsSync).not.toHaveBeenCalled();
      });

      it("should offer to initialize when .agent folder does not exist", async () => {
        const mockWorkspaceFolder = {
          uri: { fsPath: "/workspace" },
        } as vscode.WorkspaceFolder;
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = [mockWorkspaceFolder];
        vi.mocked(fs.existsSync).mockReturnValue(false);
        (vscode.window.showInformationMessage as Mock).mockResolvedValue("Initialize");

        activate(mockContext);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "No .agent folder found. Initialize project structure for Kaiban Board?",
          "Initialize",
          "Skip"
        );
      });

      it("should create basic structure when Initialize is selected and useAgentFolderInit is false", async () => {
        const mockWorkspaceFolder = {
          uri: { fsPath: "/workspace" },
        } as vscode.WorkspaceFolder;
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = [mockWorkspaceFolder];
        vi.mocked(fs.existsSync).mockReturnValue(false);
        mockGetSettings.mockReturnValue({ useAgentFolderInit: false, useTaskPrdCreator: false, useSessionDocumenter: false });
        (vscode.window.showInformationMessage as Mock).mockResolvedValue("Initialize");

        activate(mockContext);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(fs.mkdirSync).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          ".agent folder structure created successfully!"
        );
      });

      it("should use agent-folder-init skill when Initialize is selected and useAgentFolderInit is true", async () => {
        const mockWorkspaceFolder = {
          uri: { fsPath: "/workspace" },
        } as vscode.WorkspaceFolder;
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = [mockWorkspaceFolder];
        vi.mocked(fs.existsSync).mockReturnValue(false);
        mockGetSettings.mockReturnValue({ useAgentFolderInit: true, useTaskPrdCreator: false, useSessionDocumenter: false });
        (vscode.window.showInformationMessage as Mock).mockResolvedValue("Initialize");

        activate(mockContext);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockRunAgentFolderInit).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "Running agent-folder-init via Claude CLI..."
        );
      });

      it("should skip initialization when Skip is selected", async () => {
        const mockWorkspaceFolder = {
          uri: { fsPath: "/workspace" },
        } as vscode.WorkspaceFolder;
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = [mockWorkspaceFolder];
        vi.mocked(fs.existsSync).mockReturnValue(false);
        (vscode.window.showInformationMessage as Mock).mockResolvedValue("Skip");

        activate(mockContext);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(fs.mkdirSync).not.toHaveBeenCalled();
        expect(mockRunAgentFolderInit).not.toHaveBeenCalled();
      });

      it("should check for missing subfolders when .agent exists", async () => {
        const mockWorkspaceFolder = {
          uri: { fsPath: "/workspace" },
        } as vscode.WorkspaceFolder;
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = [mockWorkspaceFolder];
        vi.mocked(fs.existsSync).mockImplementation((p: string | Buffer | URL) => {
          const pathStr = typeof p === 'string' ? p : p.toString();
          if (pathStr === "/workspace/.agent") return true;
          if (pathStr === "/workspace/.agent/TASKS") return false;
          return true;
        });
        (vscode.window.showInformationMessage as Mock).mockResolvedValue("Create");

        activate(mockContext);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          expect.stringContaining("Missing .agent subfolders"),
          "Create",
          "Skip"
        );
      });

      it("should create missing subfolders when Create is selected", async () => {
        const mockWorkspaceFolder = {
          uri: { fsPath: "/workspace" },
        } as vscode.WorkspaceFolder;
        (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = [mockWorkspaceFolder];
        vi.mocked(fs.existsSync).mockImplementation((p: string | Buffer | URL) => {
          const pathStr = typeof p === 'string' ? p : p.toString();
          if (pathStr === "/workspace/.agent") return true;
          if (pathStr === "/workspace/.agent/TASKS") return false;
          return true;
        });
        (vscode.window.showInformationMessage as Mock).mockResolvedValue("Create");

        activate(mockContext);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(fs.mkdirSync).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          expect.stringContaining("Created missing folders")
        );
      });
    });
  });

  describe("deactivate", () => {
    it("should log deactivation message", () => {
      // First activate to create the kanbanView
      activate(mockContext);
      deactivate();
      expect(consoleSpy).toHaveBeenCalledWith("Kaiban Board extension deactivated");
    });

    it("should dispose kanbanView when it exists", () => {
      activate(mockContext);
      deactivate();
      expect(mockDispose).toHaveBeenCalled();
    });
  });
});
