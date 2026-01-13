import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import * as vscode from "vscode";

// Create mock functions at module level
const mockShow = vi.fn();
const mockRefresh = vi.fn();
const mockDispose = vi.fn();

// Mock the KanbanViewProvider before importing extension
vi.mock("./kanbanView", () => ({
  KanbanViewProvider: class {
    show = mockShow;
    refresh = mockRefresh;
    dispose = mockDispose;
  },
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
    // Re-mock showInformationMessage to return a Promise
    (vscode.window.showInformationMessage as Mock).mockResolvedValue(undefined);
    (vscode.window.showErrorMessage as Mock).mockResolvedValue(undefined);
    (vscode.window.showWarningMessage as Mock).mockResolvedValue(undefined);
    (vscode.window.showQuickPick as Mock).mockResolvedValue(undefined);
    (vscode.window.showInputBox as Mock).mockResolvedValue(undefined);
    (vscode.commands.registerCommand as Mock).mockClear();
    (vscode.commands.executeCommand as Mock).mockClear();
    vi.mocked(vscode.env).appName = "Cursor";
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
        const handler = registerCommandCall[1];

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
        const handler = registerCommandCall[1];

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
        const handler = registerCommandCall[1];

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
        const handler = registerCommandCall[1];

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
        const handler = registerCommandCall[1];

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
        const handler = registerCommandCall[1];

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
        const handler = registerCommandCall[1];

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
        const handler = registerCommandCall[1];

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
        const handler = registerCommandCall[1];

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
        const handler = registerCommandCall[1];

        await handler();

        expect(updateSpy).not.toHaveBeenCalled();
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
