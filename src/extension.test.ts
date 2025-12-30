import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import * as vscode from "vscode";

// Create mock functions at module level
const mockShow = vi.fn();
const mockRefresh = vi.fn();

// Mock the KanbanViewProvider before importing extension
vi.mock("./kanbanView", () => ({
  KanbanViewProvider: class {
    show = mockShow;
    refresh = mockRefresh;
  },
}));

// Mock the ApiKeyManager before importing extension
vi.mock("./config/apiKeyManager", () => ({
  ApiKeyManager: class {
    getApiKey = vi.fn().mockResolvedValue(undefined);
    hasApiKey = vi.fn().mockResolvedValue(false);
    setApiKey = vi.fn().mockResolvedValue(undefined);
    deleteApiKey = vi.fn().mockResolvedValue(undefined);
    getAllConfiguredProviders = vi.fn().mockResolvedValue([]);
    getProviderInfo = vi.fn().mockReturnValue({ name: "Test Provider" });
  },
}));

// Import extension after mocking
import { activate, deactivate } from "./extension";

describe("extension", () => {
  let mockContext: vscode.ExtensionContext;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

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
    mockShow.mockClear().mockResolvedValue(undefined);
    mockRefresh.mockClear().mockResolvedValue(undefined);
    // Re-mock showInformationMessage to return a Promise
    (vscode.window.showInformationMessage as Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("activate", () => {
    it("should log activation message", () => {
      activate(mockContext);
      expect(consoleSpy).toHaveBeenCalledWith("Kaiban Markdown extension activated");
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

    it("should add commands to subscriptions", () => {
      activate(mockContext);
      // 6 commands: showBoard, refreshBoard, configureProviders, setApiKey, clearApiKey, selectProvider
      expect(mockContext.subscriptions.length).toBe(6);
    });

    it("should show welcome message with Open Board option", () => {
      activate(mockContext);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Kaiban Markdown is ready! Use "Kaiban: Show Markdown Board" command to open.',
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
  });

  describe("deactivate", () => {
    it("should log deactivation message", () => {
      deactivate();
      expect(consoleSpy).toHaveBeenCalledWith("Kaiban Markdown extension deactivated");
    });
  });
});
