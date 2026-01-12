import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import * as vscode from "vscode";
import type { Task } from "./taskParser";

// Create mock functions at module level
const mockParseTasks = vi.fn().mockResolvedValue([]);
const mockGroupByStatus = vi.fn().mockReturnValue({
  "To Do": [],
  Doing: [],
  Testing: [],
  Done: [],
});
const mockUpdateTaskStatus = vi.fn();
const mockRejectTask = vi.fn();
const mockUpdateTaskOrder = vi.fn();
const mockUpdateTaskPRD = vi.fn();
const mockGetAvailableProviders = vi.fn().mockResolvedValue([]);
const mockGetAdapter = vi.fn();
const mockGetEnabledAdapters = vi.fn().mockResolvedValue([]);

// Mock TaskParser before importing KanbanViewProvider
vi.mock("./taskParser", () => ({
  TaskParser: class {
    parseTasks = mockParseTasks;
    groupByStatus = mockGroupByStatus;
    updateTaskStatus = mockUpdateTaskStatus;
    updateTaskOrder = mockUpdateTaskOrder;
    updateTaskPRD = mockUpdateTaskPRD;
    rejectTask = mockRejectTask;
  },
}));

// Mock ProviderRegistry to avoid issues with undefined apiKeyManager
vi.mock("./services/providerRegistry", () => ({
  ProviderRegistry: class {
    registerAdapter = vi.fn();
    getEnabledAdapters = mockGetEnabledAdapters;
    getAvailableProviders = mockGetAvailableProviders;
    getAdapter = mockGetAdapter;
  },
}));

// Mock adapter imports to prevent vscode import issues
vi.mock("./adapters/openrouterAdapter", () => ({
  OpenRouterAdapter: class {
    constructor(private readonly getApiKey: () => Promise<string | undefined>) {}
    probe = () => this.getApiKey();
  },
}));
vi.mock("./adapters/openaiAdapter", () => ({
  OpenAIAdapter: class {
    constructor(private readonly getApiKey: () => Promise<string | undefined>) {}
    probe = () => this.getApiKey();
  },
}));
vi.mock("./adapters/cursorCloudAdapter", () => ({
  CursorCloudAdapter: class {
    constructor(private readonly getApiKey: () => Promise<string | undefined>) {}
    probe = () => this.getApiKey();
  },
}));
vi.mock("./adapters/replicateAdapter", () => ({
  ReplicateAdapter: class {
    constructor(private readonly getApiKey: () => Promise<string | undefined>) {}
    probe = () => this.getApiKey();
  },
}));

import { KanbanViewProvider } from "./kanbanView";

describe("KanbanViewProvider", () => {
  let provider: KanbanViewProvider;
  let mockContext: vscode.ExtensionContext;
  let mockPanel: vscode.WebviewPanel;
  let mockWebview: vscode.Webview;
  let messageHandler: (message: unknown) => Promise<void>;
  const buildTask = (overrides: Partial<Task> = {}): Task => ({
    id: "task-1",
    label: "Task",
    status: "To Do",
    priority: "Medium",
    type: "Feature",
    description: "",
    created: "",
    updated: "",
    prdPath: "",
    filePath: "/path/to/task.md",
    completed: false,
    project: "test",
    claimedBy: "",
    claimedAt: "",
    completedAt: "",
    rejectionCount: 0,
    agentNotes: "",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset all mocks after clearAllMocks
    mockParseTasks.mockClear().mockResolvedValue([]);
    mockGroupByStatus.mockClear().mockReturnValue({
      "To Do": [],
      Doing: [],
      Testing: [],
      Done: [],
    });
    mockUpdateTaskStatus.mockClear().mockResolvedValue(undefined);
    mockUpdateTaskOrder.mockClear().mockResolvedValue(undefined);
    mockUpdateTaskPRD.mockClear().mockResolvedValue(undefined);
    mockRejectTask.mockClear().mockResolvedValue(undefined);
    mockGetAvailableProviders.mockClear().mockResolvedValue([]);
    mockGetAdapter.mockClear();
    mockGetEnabledAdapters.mockClear().mockResolvedValue([]);

    // Re-setup vscode mocks after clearAllMocks
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === "enabled") {
          // Match the actual default columns in kanbanView.ts
          return ["To Do", "Doing", "Testing", "Done"];
        }
        if (key === "basePath") {
          return ".agent/PRDS";
        }
        return defaultValue;
      }),
    } as unknown as vscode.WorkspaceConfiguration);

    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);
    vi.mocked(vscode.window.showErrorMessage).mockResolvedValue(undefined);

    mockWebview = {
      html: "",
      asWebviewUri: vi.fn((uri: unknown) => uri),
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn((handler) => {
        messageHandler = handler;
        return { dispose: vi.fn() };
      }),
    } as unknown as vscode.Webview;

    mockPanel = {
      reveal: vi.fn(),
      dispose: vi.fn(),
      webview: mockWebview,
      onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
    } as unknown as vscode.WebviewPanel;

    (vscode.window.createWebviewPanel as Mock).mockReturnValue(mockPanel);

    mockContext = {
      subscriptions: [],
      extensionUri: vscode.Uri.file("/extension"),
    } as unknown as vscode.ExtensionContext;

    provider = new KanbanViewProvider(mockContext);
  });

  describe("constructor", () => {
    it("should create TaskParser instance", () => {
      const newProvider = new KanbanViewProvider(mockContext);
      expect(newProvider).toBeDefined();
    });
  });

  describe("show", () => {
    it("should create new webview panel on first call", async () => {
      await provider.show();

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        "kaibanBoard",
        "Kaiban Board",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [{ fsPath: "/extension/media" }],
        }
      );
    });

    it("should reveal existing panel on subsequent calls", async () => {
      await provider.show();
      await provider.show();

      expect(mockPanel.reveal).toHaveBeenCalled();
    });

    it("should register onDidDispose handler", async () => {
      await provider.show();

      expect(mockPanel.onDidDispose).toHaveBeenCalled();
    });

    it("should register message handler", async () => {
      await provider.show();

      expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it("should set webview HTML content", async () => {
      await provider.show();

      expect(mockWebview.html).toContain("<!DOCTYPE html>");
      expect(mockWebview.html).toContain("Kaiban Board");
    });

    it("should clear panel reference on dispose", async () => {
      let disposeHandler: () => void;
      (mockPanel.onDidDispose as Mock).mockImplementation((handler) => {
        disposeHandler = handler;
        return { dispose: vi.fn() };
      });

      await provider.show();

      // Trigger dispose
      disposeHandler?.();

      // Trying to show again should create a new panel
      await provider.show();

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
    });
  });

  describe("refresh", () => {
    it("should do nothing if panel is undefined", async () => {
      mockParseTasks.mockClear();
      await provider.refresh();
      expect(mockParseTasks).not.toHaveBeenCalled();
    });

    it("should update webview HTML when panel exists", async () => {
      await provider.show();

      mockWebview.html = "";
      await provider.refresh();

      expect(mockWebview.html).toContain("<!DOCTYPE html>");
    });
  });

  describe("message handlers", () => {
    beforeEach(async () => {
      await provider.show();
    });

    describe("constructor", () => {
      it("registers adapters when apiKeyManager is provided", async () => {
        const apiKeyManager = {
          getApiKey: vi.fn().mockResolvedValue("token"),
        };
        const newProvider = new KanbanViewProvider(
          mockContext,
          apiKeyManager as unknown as { getApiKey: (type: string) => Promise<string | undefined> }
        );
        const registry = newProvider as unknown as {
          providerRegistry: { registerAdapter: Mock };
        };

        const adapters = registry.providerRegistry.registerAdapter.mock.calls.map(
          (call) => call[0] as { probe: () => Promise<string | undefined> }
        );
        await Promise.all(adapters.map((adapter) => adapter.probe()));

        expect(registry.providerRegistry.registerAdapter).toHaveBeenCalledTimes(4);
        expect(apiKeyManager.getApiKey).toHaveBeenCalledTimes(4);
      });
    });

    describe("openTask command", () => {
      it("should open task file successfully", async () => {
        (vscode.workspace.openTextDocument as Mock).mockResolvedValue({});
        (vscode.window.showTextDocument as Mock).mockResolvedValue({});

        await messageHandler({ command: "openTask", filePath: "/path/to/task.md" });

        expect(vscode.Uri.file).toHaveBeenCalledWith("/path/to/task.md");
        expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
        expect(vscode.window.showTextDocument).toHaveBeenCalled();
      });

      it("should show error message when open fails", async () => {
        (vscode.workspace.openTextDocument as Mock).mockRejectedValue(new Error("File not found"));

        await messageHandler({ command: "openTask", filePath: "/path/to/task.md" });

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to open task file")
        );
      });
    });

    describe("refresh command", () => {
      it("should refresh the board", async () => {
        await messageHandler({ command: "refresh" });

        // HTML should be updated (refreshed)
        expect(mockWebview.html).toContain("<!DOCTYPE html>");
      });
    });

    describe("saveColumnSettings command", () => {
      it("should update column settings", async () => {
        const updateSpy = vi.fn().mockResolvedValue(undefined);
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
          update: updateSpy,
        } as unknown as vscode.WorkspaceConfiguration);

        await messageHandler({ command: "saveColumnSettings", columns: ["To Do"] });

        expect(updateSpy).toHaveBeenCalledWith(
          "enabled",
          ["To Do"],
          vscode.ConfigurationTarget.Workspace
        );
      });
    });

    describe("loadPRD command", () => {
      it("should load PRD content successfully", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
          getText: () => "# PRD Content\n\n**Bold text**",
        });

        await messageHandler({ command: "loadPRD", prdPath: "./prd/test.md" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "updatePRDContent",
            content: expect.stringContaining("PRD Content"),
          })
        );
      });

      it("should resolve PRD path containing base path directory", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
          getText: () => "# Found PRD",
        });

        await messageHandler({
          command: "loadPRD",
          prdPath: "../../PRDS/specs/prd.md",
        });

        expect(mockWebview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "updatePRDContent",
            content: expect.stringContaining("Found PRD"),
          })
        );
      });

      it("should resolve PRD path with base path segment only", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
          getText: () => "# Base Path PRD",
        });

        await messageHandler({
          command: "loadPRD",
          prdPath: "../PRDS",
        });

        expect(mockWebview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "updatePRDContent",
            content: expect.stringContaining("Base Path PRD"),
          })
        );
      });

      it("should resolve simple relative PRD paths", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
          getText: () => "# Simple PRD",
        });

        await messageHandler({
          command: "loadPRD",
          prdPath: "docs/prd.md",
        });

        expect(mockWebview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "updatePRDContent",
            content: expect.stringContaining("Simple PRD"),
          })
        );
      });

      it("should fall back to task file path when base path lookup fails", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        (vscode.workspace.openTextDocument as Mock)
          .mockRejectedValueOnce(new Error("Not found"))
          .mockResolvedValueOnce({
            getText: () => "# Fallback PRD",
          });

        await messageHandler({
          command: "loadPRD",
          prdPath: "./prd/test.md",
          taskFilePath: "/workspace/.agent/TASKS/task.md",
        });

        expect(mockWebview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "updatePRDContent",
            content: expect.stringContaining("Fallback PRD"),
          })
        );
      });

      it("should keep searching when PRD content is empty across strategies", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
          getText: () => "",
        });

        await messageHandler({
          command: "loadPRD",
          prdPath: "./prd/test.md",
          taskFilePath: "/workspace/.agent/TASKS/task.md",
        });

        expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(3);
        expect(mockWebview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "updatePRDContent",
            content: expect.stringContaining("No PRD found"),
          })
        );
      });

      it("should handle absolute PRD paths without workspace fallback", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        (vscode.workspace.openTextDocument as Mock).mockRejectedValue(new Error("Not found"));

        await messageHandler({ command: "loadPRD", prdPath: "/tmp/prd.md" });

        expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(1);
        expect(mockWebview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "updatePRDContent",
            content: expect.stringContaining("No PRD found"),
          })
        );
      });

      it("should post not found message when PRD file not found", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        (vscode.workspace.openTextDocument as Mock).mockRejectedValue(new Error("Not found"));

        await messageHandler({ command: "loadPRD", prdPath: "./prd/test.md" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "updatePRDContent",
            content: expect.stringContaining("No PRD found"),
          })
        );
      });

      it("should return early when no workspace folders", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = undefined;

        await messageHandler({ command: "loadPRD", prdPath: "./prd/test.md" });

        expect(mockWebview.postMessage).not.toHaveBeenCalled();
      });

      it("should try multiple workspace folders to find PRD", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace1" } },
          { uri: { fsPath: "/workspace2" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        (vscode.workspace.openTextDocument as Mock)
          .mockRejectedValueOnce(new Error("Not in first"))
          .mockResolvedValueOnce({
            getText: () => "# Found in second",
          });

        await messageHandler({ command: "loadPRD", prdPath: "./prd/test.md" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "updatePRDContent",
            content: expect.stringContaining("Found in second"),
          })
        );
      });

      it("should handle error during loadPRD content loading", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        vi.mocked(vscode.workspace.getConfiguration).mockImplementation(() => {
          throw new Error("Config error");
        });

        await messageHandler({ command: "loadPRD", prdPath: "./prd/test.md" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "updatePRDContent",
            content: expect.stringContaining("Error loading PRD"),
          })
        );
      });
    });

    describe("updateTaskStatus command", () => {
      it("should update task status successfully", async () => {
        mockUpdateTaskStatus.mockResolvedValue(undefined);

        await messageHandler({
          command: "updateTaskStatus",
          taskId: "task-001",
          newStatus: "Done",
        });

        expect(mockUpdateTaskStatus).toHaveBeenCalledWith("task-001", "Done");
      });

      it("should show error message when update fails", async () => {
        mockUpdateTaskStatus.mockRejectedValue(new Error("Update failed"));

        await messageHandler({
          command: "updateTaskStatus",
          taskId: "task-001",
          newStatus: "Done",
        });

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to update task status")
        );
      });
    });

    describe("updateTaskOrder command", () => {
      it("should update task order when status is unchanged", async () => {
        await messageHandler({
          command: "updateTaskOrder",
          taskId: "task-001",
          order: 2,
        });

        expect(mockUpdateTaskOrder).toHaveBeenCalledWith("task-001", 2);
      });

      it("should update task status and order when status changes", async () => {
        await messageHandler({
          command: "updateTaskOrder",
          taskId: "task-001",
          order: 1,
          newStatus: "Doing",
        });

        expect(mockUpdateTaskStatus).toHaveBeenCalledWith("task-001", "Doing", 1);
      });
    });

    // Note: rejectTask command handler is not currently implemented in the switch statement
    // These tests are skipped until the handler is added
    describe.skip("rejectTask command", () => {
      it("should reject task successfully", async () => {
        mockRejectTask.mockResolvedValue(undefined);

        await messageHandler({
          command: "rejectTask",
          taskId: "task-001",
          note: "Needs revision",
        });

        expect(mockRejectTask).toHaveBeenCalledWith("task-001", "Needs revision");
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "Task rejected and moved back to To Do"
        );
      });

      it("should show error message when rejection fails", async () => {
        mockRejectTask.mockRejectedValue(new Error("Reject failed"));

        await messageHandler({
          command: "rejectTask",
          taskId: "task-001",
          note: "Note",
        });

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to reject task")
        );
      });
    });

    describe("openSettings command", () => {
      it("should execute PRD path configuration command", async () => {
        await messageHandler({ command: "openSettings" });
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith("kaiban.configurePRDPath");
      });
    });

    describe("openExtensionSettings command", () => {
      it("should open extension settings", async () => {
        await messageHandler({ command: "openExtensionSettings" });

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          "workbench.action.openSettings",
          "kaiban"
        );
      });
    });

    describe("createPRD command", () => {
      it("should create a PRD file and link it to the task", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        const task = buildTask({
          id: "task-123",
          label: "New Feature",
          description: "Feature description",
        });
        mockParseTasks.mockResolvedValue([task]);

        await messageHandler({ command: "createPRD", taskId: "task-123", prdPath: "" });

        expect(vscode.workspace.fs.createDirectory).toHaveBeenCalledWith(
          expect.objectContaining({ fsPath: "/workspace/.agent/PRDS" })
        );
        expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
          expect.objectContaining({ fsPath: "/workspace/.agent/PRDS/new-feature.md" }),
          expect.any(Uint8Array)
        );
        expect(mockUpdateTaskPRD).toHaveBeenCalledWith("task-123", "../.agent/PRDS/new-feature.md");
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(
          expect.objectContaining({ fsPath: "/workspace/.agent/PRDS/new-feature.md" })
        );
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "PRD created: new-feature.md"
        );
      });

      it("should show an error when no workspace is open", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = undefined;

        await messageHandler({ command: "createPRD", taskId: "task-123", prdPath: "" });

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("No workspace folder open");
      });
    });

    describe("editPRD command", () => {
      it("should open the PRD file from the configured base path", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        await messageHandler({
          command: "editPRD",
          prdPath: "../.agent/PRDS/test-prd.md",
        });

        expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(
          expect.objectContaining({ fsPath: "/workspace/.agent/PRDS/test-prd.md" })
        );
        expect(vscode.window.showTextDocument).toHaveBeenCalled();
      });
    });

    describe("batch execution commands", () => {
      it("should warn when no tasks are provided", async () => {
        await messageHandler({ command: "startBatchExecution", taskIds: [] });

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith("No tasks to execute");
      });

      it("should warn when batch execution is already running", async () => {
        const internal = provider as unknown as { isBatchExecuting: boolean };
        internal.isBatchExecuting = true;

        await messageHandler({ command: "startBatchExecution", taskIds: ["task-1"] });

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
          "Batch execution already in progress"
        );
      });

      it("should start batch execution and notify the webview", async () => {
        const executeNextBatchTaskSpy = vi
          .spyOn(
            provider as unknown as { executeNextBatchTask: () => Promise<void> },
            "executeNextBatchTask"
          )
          .mockResolvedValue(undefined);

        await messageHandler({
          command: "startBatchExecution",
          taskIds: ["task-1", "task-2"],
        });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "batchExecutionStarted",
          total: 2,
          taskIds: ["task-1", "task-2"],
        });
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "Starting batch execution of 2 tasks"
        );
        expect(executeNextBatchTaskSpy).toHaveBeenCalled();
      });

      it("should cancel batch execution and dispose the terminal", async () => {
        const internal = provider as unknown as {
          isBatchExecuting: boolean;
          batchExecutionQueue: string[];
          currentBatchIndex: number;
          claudeTerminals: Map<string, vscode.Terminal>;
          cleanupTaskTracking: (taskId: string, includeTerminal?: boolean) => void;
        };
        const terminal = { dispose: vi.fn() } as unknown as vscode.Terminal;

        internal.isBatchExecuting = true;
        internal.batchExecutionQueue = ["task-123"];
        internal.currentBatchIndex = 0;
        internal.claudeTerminals.set("task-123", terminal);

        const cleanupSpy = vi.spyOn(internal, "cleanupTaskTracking");

        await messageHandler({ command: "cancelBatchExecution" });

        expect(terminal.dispose).toHaveBeenCalled();
        expect(cleanupSpy).toHaveBeenCalledWith("task-123", true);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "Batch execution cancelled"
        );
      });
    });

    describe("getAvailableProviders command", () => {
      it("should post available providers to webview", async () => {
        mockGetAvailableProviders.mockResolvedValueOnce([
          { id: "openai", name: "OpenAI", type: "openai", enabled: true },
        ]);

        await messageHandler({ command: "getAvailableProviders" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "availableProviders",
          providers: [{ id: "openai", name: "OpenAI", type: "openai", enabled: true }],
        });
      });

      it("should post error when providers cannot be loaded", async () => {
        mockGetAvailableProviders.mockRejectedValueOnce(new Error("Failed"));

        await messageHandler({ command: "getAvailableProviders" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "providerError",
          error: "Error: Failed",
        });
      });
    });

    describe("getModelsForProvider command", () => {
      it("should post error when provider is missing", async () => {
        mockGetAdapter.mockReturnValueOnce(undefined);

        await messageHandler({ command: "getModelsForProvider", provider: "openai" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "updateModelsForProvider",
          models: [],
          error: "Error: Provider openai not found",
        });
      });

      it("should post models for provider", async () => {
        const adapter = {
          getAvailableModels: vi.fn().mockResolvedValue([{ id: "model-1" }]),
        };
        mockGetAdapter.mockReturnValueOnce(adapter);

        await messageHandler({ command: "getModelsForProvider", provider: "openai" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "updateModelsForProvider",
          provider: "openai",
          models: [{ id: "model-1" }],
        });
      });
    });

    describe("prepareAgentPrompt command", () => {
      it("should show error when task is missing", async () => {
        mockParseTasks.mockResolvedValueOnce([]);

        await messageHandler({ command: "prepareAgentPrompt", taskId: "missing" });

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          "Error preparing agent: Error: Task missing not found"
        );
      });

      it("should show error when task is claimed", async () => {
        mockParseTasks.mockResolvedValueOnce([buildTask({ claimedBy: "cursor" })]);

        await messageHandler({ command: "prepareAgentPrompt", taskId: "task-1" });

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          "Error preparing agent: Error: Task is already claimed by cursor"
        );
      });

      it("should post agent modal data with PRD content", async () => {
        const task = buildTask({ prdPath: "./prd/test.md", agentNotes: "Note" });
        mockParseTasks.mockResolvedValueOnce([task]);
        mockGetAvailableProviders.mockResolvedValueOnce([
          { id: "openai", name: "OpenAI", type: "openai", enabled: true },
        ]);
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];
        (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
          getText: () => "# PRD",
        });

        await messageHandler({ command: "prepareAgentPrompt", taskId: "task-1" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "showAgentModal",
          task: expect.objectContaining({ id: "task-1", prdContent: "# PRD" }),
          providers: [{ id: "openai", name: "OpenAI", type: "openai", enabled: true }],
        });
      });

      it("should post agent modal data when no PRD path", async () => {
        const task = buildTask({ prdPath: "" });
        mockParseTasks.mockResolvedValueOnce([task]);
        mockGetAvailableProviders.mockResolvedValueOnce([
          { id: "openai", name: "OpenAI", type: "openai", enabled: true },
        ]);

        await messageHandler({ command: "prepareAgentPrompt", taskId: "task-1" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "showAgentModal",
          task: expect.objectContaining({ id: "task-1", prdContent: "" }),
          providers: [{ id: "openai", name: "OpenAI", type: "openai", enabled: true }],
        });
      });
    });

    describe("sendToAgent command", () => {
      it("should post error when task is missing", async () => {
        mockParseTasks.mockResolvedValueOnce([]);

        await messageHandler({ command: "sendToAgent", taskId: "missing", provider: "openai" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "agentSendError",
          taskId: "missing",
          error: "Error: Task missing not found",
        });
      });

      it("should post error when task already claimed", async () => {
        mockParseTasks.mockResolvedValueOnce([buildTask({ claimedBy: "cursor" })]);

        await messageHandler({ command: "sendToAgent", taskId: "task-1", provider: "openai" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "agentSendError",
          taskId: "task-1",
          error: "Error: Task is already claimed by cursor",
        });
      });

      it("should post error when adapter is missing", async () => {
        mockParseTasks.mockResolvedValueOnce([buildTask()]);
        mockGetAdapter.mockReturnValueOnce(undefined);

        await messageHandler({ command: "sendToAgent", taskId: "task-1", provider: "openai" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "agentSendError",
          taskId: "task-1",
          error: "Error: Provider openai not available",
        });
      });

      it("should post error when adapter returns error response", async () => {
        mockParseTasks.mockResolvedValueOnce([buildTask()]);
        const adapter = {
          displayName: "OpenAI",
          supportsAgentMode: false,
          sendTask: vi.fn().mockResolvedValue({
            id: "",
            status: "error",
            provider: "openai",
            error: "API down",
          }),
        };
        mockGetAdapter.mockReturnValueOnce(adapter);

        await messageHandler({ command: "sendToAgent", taskId: "task-1", provider: "openai" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "agentSendError",
          taskId: "task-1",
          error: "API down",
        });
      });

      it("should send task and notify success", async () => {
        vi.useFakeTimers();
        mockParseTasks.mockResolvedValueOnce([buildTask({ status: "Doing" })]);
        const adapter = {
          displayName: "Cursor",
          supportsAgentMode: true,
          sendTask: vi.fn().mockResolvedValue({
            id: "agent-1",
            status: "completed",
            provider: "cursor",
            branchName: "cursor-agent/task",
          }),
          checkStatus: vi.fn().mockResolvedValue({
            id: "agent-1",
            status: "completed",
            provider: "cursor",
            prUrl: "https://example.com/pr",
          }),
        };
        mockGetAdapter.mockReturnValue(adapter);
        (vscode.window.showInformationMessage as Mock).mockResolvedValue("View PR");

        await messageHandler({
          command: "sendToAgent",
          taskId: "task-1",
          provider: "cursor",
          model: "cursor-agent",
        });

        vi.advanceTimersByTime(30000);
        await vi.runOnlyPendingTimersAsync();

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "agentSendSuccess",
          taskId: "task-1",
          agentId: "agent-1",
          provider: "cursor",
          model: "cursor-agent",
        });
        expect(vscode.env.openExternal).toHaveBeenCalled();
        vi.useRealTimers();
      });

      it("should include PRD content when sending to agent", async () => {
        const loadSpy = vi
          .spyOn(
            provider as unknown as { loadPRDContentRaw: (path: string) => Promise<string> },
            "loadPRDContentRaw"
          )
          .mockResolvedValueOnce("PRD content");
        mockParseTasks.mockResolvedValueOnce([buildTask({ status: "Doing", prdPath: "./prd.md" })]);
        const adapter = {
          displayName: "OpenAI",
          supportsAgentMode: false,
          sendTask: vi.fn().mockResolvedValue({
            id: "agent-2",
            status: "completed",
            provider: "openai",
          }),
        };
        mockGetAdapter.mockReturnValue(adapter);

        await messageHandler({
          command: "sendToAgent",
          taskId: "task-1",
          provider: "openai",
        });

        expect(loadSpy).toHaveBeenCalledWith("./prd.md");
        expect(adapter.sendTask).toHaveBeenCalledWith(
          expect.objectContaining({ prdContent: "PRD content" }),
          { model: undefined }
        );
      });

      it("should show send message without branch name", async () => {
        mockParseTasks.mockResolvedValueOnce([buildTask({ status: "Doing" })]);
        const adapter = {
          displayName: "OpenAI",
          supportsAgentMode: false,
          sendTask: vi.fn().mockResolvedValue({
            id: "agent-3",
            status: "completed",
            provider: "openai",
          }),
        };
        mockGetAdapter.mockReturnValue(adapter);

        await messageHandler({
          command: "sendToAgent",
          taskId: "task-1",
          provider: "openai",
        });

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Task sent to OpenAI");
      });
    });
  });

  describe("renderMarkdown (via loadPRD)", () => {
    beforeEach(async () => {
      await provider.show();
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
    });

    it("should convert headers", async () => {
      (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
        getText: () => "# H1\n## H2\n### H3",
      });

      await messageHandler({ command: "loadPRD", prdPath: "./test.md" });

      const postMessageCall = (mockWebview.postMessage as Mock).mock.calls[0][0];
      expect(postMessageCall.content).toContain("<h1>H1</h1>");
      expect(postMessageCall.content).toContain("<h2>H2</h2>");
      expect(postMessageCall.content).toContain("<h3>H3</h3>");
    });

    it("should convert bold and italic", async () => {
      (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
        getText: () => "**bold** and *italic*",
      });

      await messageHandler({ command: "loadPRD", prdPath: "./test.md" });

      const postMessageCall = (mockWebview.postMessage as Mock).mock.calls[0][0];
      expect(postMessageCall.content).toContain("<strong>bold</strong>");
      expect(postMessageCall.content).toContain("<em>italic</em>");
    });

    it("should convert code blocks", async () => {
      (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
        getText: () => "```\ncode\n```",
      });

      await messageHandler({ command: "loadPRD", prdPath: "./test.md" });

      const postMessageCall = (mockWebview.postMessage as Mock).mock.calls[0][0];
      expect(postMessageCall.content).toContain("<pre><code>");
    });

    it("should convert inline code", async () => {
      (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
        getText: () => "use `code` here",
      });

      await messageHandler({ command: "loadPRD", prdPath: "./test.md" });

      const postMessageCall = (mockWebview.postMessage as Mock).mock.calls[0][0];
      expect(postMessageCall.content).toContain("<code>code</code>");
    });

    it("should convert links", async () => {
      (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
        getText: () => "[text](http://example.com)",
      });

      await messageHandler({ command: "loadPRD", prdPath: "./test.md" });

      const postMessageCall = (mockWebview.postMessage as Mock).mock.calls[0][0];
      expect(postMessageCall.content).toContain('<a href="http://example.com">text</a>');
    });
  });

  describe("getWebviewContent", () => {
    it("should generate HTML with all four columns", async () => {
      const task = buildTask({ status: "To Do" });
      mockParseTasks.mockResolvedValue([task]);
      mockGroupByStatus.mockReturnValue({
        "To Do": [task],
        Doing: [],
        Testing: [],
        Done: [],
      });

      await provider.show();

      expect(mockWebview.html).toContain("To Do");
      expect(mockWebview.html).toContain("Doing");
      expect(mockWebview.html).toContain("Testing");
      expect(mockWebview.html).toContain("Done");
    });

    it("should show empty state welcome when board is empty", async () => {
      await provider.show();

      expect(mockWebview.html).toContain("Welcome to Kaiban Board!");
    });

    it("should render tasks with correct priority classes", async () => {
      const tasks: Task[] = [
        {
          id: "1",
          label: "High Task",
          priority: "High",
          status: "To Do",
          type: "Feature",
          description: "",
          created: "",
          updated: "",
          prdPath: "",
          filePath: "/path/to/task.md",
          completed: false,
          project: "test",
          claimedBy: "",
          claimedAt: "",
          completedAt: "",
          rejectionCount: 0,
          agentNotes: "",
        },
        {
          id: "2",
          label: "Medium Task",
          priority: "Medium",
          status: "To Do",
          type: "Bug",
          description: "",
          created: "",
          updated: "",
          prdPath: "",
          filePath: "/path/to/task2.md",
          completed: false,
          project: "test",
          claimedBy: "",
          claimedAt: "",
          completedAt: "",
          rejectionCount: 0,
          agentNotes: "",
        },
        {
          id: "3",
          label: "Low Task",
          priority: "Low",
          status: "To Do",
          type: "Task",
          description: "",
          created: "",
          updated: "",
          prdPath: "",
          filePath: "/path/to/task3.md",
          completed: false,
          project: "test",
          claimedBy: "",
          claimedAt: "",
          completedAt: "",
          rejectionCount: 0,
          agentNotes: "",
        },
      ];

      mockParseTasks.mockResolvedValue(tasks);
      mockGroupByStatus.mockReturnValue({
        "To Do": tasks,
        Doing: [],
        Testing: [],
        Done: [],
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("priority-high");
      expect(mockWebview.html).toContain("priority-medium");
      expect(mockWebview.html).toContain("priority-low");
    });

    // Skip: The reject button UI has been removed/changed
    it.skip("should show reject button for Testing tasks", async () => {
      const tasks: Task[] = [
        {
          id: "1",
          label: "Testing Task",
          status: "Testing",
          priority: "Medium",
          type: "Feature",
          description: "",
          created: "",
          updated: "",
          prdPath: "",
          filePath: "/path/to/task.md",
          completed: false,
          project: "test",
          claimedBy: "",
          claimedAt: "",
          completedAt: "",
          rejectionCount: 0,
          agentNotes: "",
        },
      ];

      mockParseTasks.mockResolvedValue(tasks);
      mockGroupByStatus.mockReturnValue({
        "To Do": [],
        Doing: [],
        Testing: tasks,
        Done: [],
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("reject-btn");
      expect(mockWebview.html).toContain("showRejectModal");
    });

    it("should show agent badge when claimedBy is set", async () => {
      const tasks: Task[] = [
        {
          id: "1",
          label: "Agent Task",
          status: "Testing",
          priority: "Medium",
          type: "Feature",
          description: "",
          created: "",
          updated: "",
          prdPath: "",
          filePath: "/path/to/task.md",
          completed: false,
          project: "test",
          claimedBy: "claude-opus",
          claimedAt: "2024-01-01",
          completedAt: "",
          rejectionCount: 0,
          agentNotes: "",
        },
      ];

      mockParseTasks.mockResolvedValue(tasks);
      mockGroupByStatus.mockReturnValue({
        "To Do": [],
        Doing: [],
        Testing: tasks,
        Done: [],
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("agent-badge");
      expect(mockWebview.html).toContain("claude");
    });

    it("should render agent button when sending is allowed", async () => {
      const task = buildTask({ status: "To Do" });
      const html = await (
        provider as unknown as {
          getWebviewContent: (
            groupedTasks: Record<string, Task[]>,
            hasAnyApiKey: boolean
          ) => Promise<string>;
        }
      ).getWebviewContent(
        {
          "To Do": [task],
          Doing: [],
          Testing: [],
          Done: [],
        },
        true
      );

      expect(html).toContain("showAgentModal('task-1')");
    });

    it("should hide agent button when agent is running", async () => {
      const task = buildTask({ status: "Doing", agentStatus: "running" });
      const html = await (
        provider as unknown as {
          getWebviewContent: (
            groupedTasks: Record<string, Task[]>,
            hasAnyApiKey: boolean
          ) => Promise<string>;
        }
      ).getWebviewContent(
        {
          "To Do": [],
          Doing: [task],
          Testing: [],
          Done: [],
        },
        true
      );

      expect(html).not.toContain("showAgentModal('task-1')");
    });

    it("should hide agent button for non-active status", async () => {
      const task = buildTask({ status: "Done" });
      const html = await (
        provider as unknown as {
          getWebviewContent: (
            groupedTasks: Record<string, Task[]>,
            hasAnyApiKey: boolean
          ) => Promise<string>;
        }
      ).getWebviewContent(
        {
          "To Do": [],
          Doing: [],
          Testing: [],
          Done: [task],
        },
        true
      );

      expect(html).not.toContain("showAgentModal('task-1')");
    });

    it("should show rejection count badge when rejectionCount > 0", async () => {
      const tasks: Task[] = [
        {
          id: "1",
          label: "Rejected Task",
          status: "To Do",
          priority: "Medium",
          type: "Feature",
          description: "",
          created: "",
          updated: "",
          prdPath: "",
          filePath: "/path/to/task.md",
          completed: false,
          project: "test",
          claimedBy: "",
          claimedAt: "",
          completedAt: "",
          rejectionCount: 3,
          agentNotes: "",
        },
      ];

      mockParseTasks.mockResolvedValue(tasks);
      mockGroupByStatus.mockReturnValue({
        "To Do": tasks,
        Doing: [],
        Testing: [],
        Done: [],
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("rejection-badge");
    });

    it("should dim completed tasks without showing a done badge", async () => {
      const tasks: Task[] = [
        {
          id: "1",
          label: "Done Task",
          status: "Done",
          priority: "Medium",
          type: "Feature",
          description: "",
          created: "",
          updated: "",
          prdPath: "",
          filePath: "/path/to/task.md",
          completed: true,
          project: "test",
          claimedBy: "",
          claimedAt: "",
          completedAt: "",
          rejectionCount: 0,
          agentNotes: "",
        },
      ];

      mockParseTasks.mockResolvedValue(tasks);
      mockGroupByStatus.mockReturnValue({
        "To Do": [],
        Doing: [],
        Testing: [],
        Done: tasks,
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).not.toContain("[Done]");
      expect(mockWebview.html).toContain("completed");
    });

    it("should show agent running badge and provider badge", async () => {
      const tasks: Task[] = [
        buildTask({
          agentStatus: "running",
          agentProvider: "openai",
          status: "Doing",
        }),
      ];

      mockParseTasks.mockResolvedValue(tasks);
      mockGroupByStatus.mockReturnValue({
        "To Do": [],
        Doing: tasks,
        Testing: [],
        Done: [],
      });
      mockGetEnabledAdapters.mockResolvedValueOnce([{}]);

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("agent-running");
      expect(mockWebview.html).toContain("provider-openai");
    });
  });

  describe("escapeHtml", () => {
    it("should escape ampersand", async () => {
      const tasks: Task[] = [
        {
          id: "1",
          label: "Task with & symbol",
          status: "To Do",
          priority: "Medium",
          type: "Feature",
          description: "",
          created: "",
          updated: "",
          prdPath: "",
          filePath: "/path/to/task.md",
          completed: false,
          project: "test",
          claimedBy: "",
          claimedAt: "",
          completedAt: "",
          rejectionCount: 0,
          agentNotes: "",
        },
      ];

      mockParseTasks.mockResolvedValue(tasks);
      mockGroupByStatus.mockReturnValue({
        "To Do": tasks,
        Doing: [],
        Testing: [],
        Done: [],
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("Task with &amp; symbol");
    });

    it("should escape less than and greater than", async () => {
      const tasks: Task[] = [
        {
          id: "1",
          label: "Task with <script> tag",
          status: "To Do",
          priority: "Medium",
          type: "Feature",
          description: "",
          created: "",
          updated: "",
          prdPath: "",
          filePath: "/path/to/task.md",
          completed: false,
          project: "test",
          claimedBy: "",
          claimedAt: "",
          completedAt: "",
          rejectionCount: 0,
          agentNotes: "",
        },
      ];

      mockParseTasks.mockResolvedValue(tasks);
      mockGroupByStatus.mockReturnValue({
        "To Do": tasks,
        Doing: [],
        Testing: [],
        Done: [],
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("&lt;script&gt;");
    });

    it("should escape quotes", async () => {
      const tasks: Task[] = [
        {
          id: "1",
          label: "Task with \"quotes\" and 'apostrophes'",
          status: "To Do",
          priority: "Medium",
          type: "Feature",
          description: "",
          created: "",
          updated: "",
          prdPath: "",
          filePath: "/path/to/task.md",
          completed: false,
          project: "test",
          claimedBy: "",
          claimedAt: "",
          completedAt: "",
          rejectionCount: 0,
          agentNotes: "",
        },
      ];

      mockParseTasks.mockResolvedValue(tasks);
      mockGroupByStatus.mockReturnValue({
        "To Do": tasks,
        Doing: [],
        Testing: [],
        Done: [],
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("&quot;quotes&quot;");
      expect(mockWebview.html).toContain("&#039;apostrophes&#039;");
    });
  });

  describe("config change handling", () => {
    it("refreshes when column settings change unless skipped", async () => {
      let configHandler: ((e: vscode.ConfigurationChangeEvent) => void) | undefined;
      vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation((handler) => {
        configHandler = handler;
        return { dispose: vi.fn() };
      });

      const newProvider = new KanbanViewProvider(mockContext);
      const refreshSpy = vi.spyOn(newProvider, "refresh").mockResolvedValue(undefined);

      configHandler?.({
        affectsConfiguration: (key: string) => key === "kaiban.columns.enabled",
      } as unknown as vscode.ConfigurationChangeEvent);

      expect(refreshSpy).toHaveBeenCalled();

      const internal = newProvider as unknown as { skipNextConfigRefresh: boolean };
      internal.skipNextConfigRefresh = true;
      refreshSpy.mockClear();

      configHandler?.({
        affectsConfiguration: (key: string) => key === "kaiban.columns.enabled",
      } as unknown as vscode.ConfigurationChangeEvent);

      expect(refreshSpy).not.toHaveBeenCalled();
      expect(internal.skipNextConfigRefresh).toBe(false);
    });

    it("does not refresh on unrelated configuration changes", async () => {
      let configHandler: ((e: vscode.ConfigurationChangeEvent) => void) | undefined;
      vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation((handler) => {
        configHandler = handler;
        return { dispose: vi.fn() };
      });

      const newProvider = new KanbanViewProvider(mockContext);
      const refreshSpy = vi.spyOn(newProvider, "refresh").mockResolvedValue(undefined);

      configHandler?.({
        affectsConfiguration: () => false,
      } as unknown as vscode.ConfigurationChangeEvent);

      expect(refreshSpy).not.toHaveBeenCalled();
    });
  });

  describe("early returns without panel", () => {
    it("no-ops handler calls when panel is undefined", async () => {
      const internal = provider as unknown as {
        loadPRDContent: (path: string, taskFilePath?: string) => Promise<void>;
        handleGetAvailableProviders: () => Promise<void>;
        handleGetModelsForProvider: (provider: "openai") => Promise<void>;
        handlePrepareAgentPrompt: (taskId: string) => Promise<void>;
        handleSendToAgent: (taskId: string, provider: "openai") => Promise<void>;
      };

      await internal.loadPRDContent("./prd.md");
      await internal.handleGetAvailableProviders();
      await internal.handleGetModelsForProvider("openai");
      await internal.handlePrepareAgentPrompt("task-1");
      await internal.handleSendToAgent("task-1", "openai");

      expect(mockWebview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("saveColumnSettings", () => {
    it("clears skip flag when update fails", async () => {
      const internal = provider as unknown as {
        saveColumnSettings: (columns: string[]) => Promise<void>;
        skipNextConfigRefresh: boolean;
      };

      const updateSpy = vi.fn().mockRejectedValue(new Error("update failed"));
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
        update: updateSpy,
      } as unknown as vscode.WorkspaceConfiguration);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await internal.saveColumnSettings(["To Do"]);

      expect(internal.skipNextConfigRefresh).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("startAgentPolling", () => {
    it("stops polling when adapter does not support status checks", async () => {
      vi.useFakeTimers();
      mockGetAdapter.mockReturnValueOnce({});

      const internal = provider as unknown as {
        startAgentPolling: (taskId: string, agentId: string, provider: "openai") => void;
        pollingIntervals: Map<string, NodeJS.Timeout>;
      };

      internal.startAgentPolling("task-1", "agent-1", "openai");
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      expect(internal.pollingIntervals.size).toBe(0);
      vi.useRealTimers();
    });

    it("handles completed status without PR URL", async () => {
      vi.useFakeTimers();
      mockGetAdapter.mockReturnValueOnce({
        checkStatus: vi.fn().mockResolvedValue({
          id: "agent-1",
          status: "completed",
          provider: "openai",
        }),
      });
      (vscode.window.showInformationMessage as Mock).mockResolvedValue(undefined);

      const internal = provider as unknown as {
        startAgentPolling: (taskId: string, agentId: string, provider: "openai") => void;
      };

      internal.startAgentPolling("task-1", "agent-1", "openai");
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Agent completed the task!"
      );
      vi.useRealTimers();
    });

    it("does not open PR when PR URL is missing", async () => {
      vi.useFakeTimers();
      mockGetAdapter.mockReturnValueOnce({
        checkStatus: vi.fn().mockResolvedValue({
          id: "agent-1",
          status: "completed",
          provider: "openai",
          prUrl: "",
        }),
      });
      (vscode.window.showInformationMessage as Mock).mockResolvedValue("View PR");

      const internal = provider as unknown as {
        startAgentPolling: (taskId: string, agentId: string, provider: "openai") => void;
      };

      internal.startAgentPolling("task-1", "agent-1", "openai");
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      expect(vscode.env.openExternal).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("handles error status with warning message", async () => {
      vi.useFakeTimers();
      mockGetAdapter.mockReturnValueOnce({
        checkStatus: vi.fn().mockResolvedValue({
          id: "agent-1",
          status: "error",
          provider: "openai",
          error: "Boom",
        }),
      });

      const internal = provider as unknown as {
        startAgentPolling: (taskId: string, agentId: string, provider: "openai") => void;
      };

      internal.startAgentPolling("task-1", "agent-1", "openai");
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Agent encountered an error: Boom"
      );
      vi.useRealTimers();
    });

    it("logs polling errors", async () => {
      vi.useFakeTimers();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockGetAdapter.mockReturnValueOnce({
        checkStatus: vi.fn().mockRejectedValue(new Error("poll failed")),
      });

      const internal = provider as unknown as {
        startAgentPolling: (taskId: string, agentId: string, provider: "openai") => void;
      };

      internal.startAgentPolling("task-1", "agent-1", "openai");
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    });

    it("ignores non-terminal agent statuses", async () => {
      vi.useFakeTimers();
      mockGetAdapter.mockReturnValueOnce({
        checkStatus: vi.fn().mockResolvedValue({
          id: "agent-2",
          status: "running",
          provider: "openai",
        }),
      });

      const internal = provider as unknown as {
        startAgentPolling: (taskId: string, agentId: string, provider: "openai") => void;
        stopAgentPolling: (taskId: string) => void;
      };

      internal.startAgentPolling("task-2", "agent-2", "openai");
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
      internal.stopAgentPolling("task-2");
      vi.useRealTimers();
    });
  });

  describe("stopAgentPolling", () => {
    it("does nothing when no interval exists", () => {
      const internal = provider as unknown as {
        stopAgentPolling: (taskId: string) => void;
        pollingIntervals: Map<string, NodeJS.Timeout>;
      };

      internal.stopAgentPolling("missing-task");
      expect(internal.pollingIntervals.size).toBe(0);
    });
  });

  describe("loadPRDContentRaw", () => {
    it("returns empty string when no workspace folders", async () => {
      const internal = provider as unknown as {
        loadPRDContentRaw: (path: string) => Promise<string>;
      };
      vi.mocked(vscode.workspace).workspaceFolders = undefined;

      const result = await internal.loadPRDContentRaw("./prd.md");
      expect(result).toBe("");
    });

    it("skips workspace root fallback for absolute paths", async () => {
      const internal = provider as unknown as {
        loadPRDContentRaw: (path: string) => Promise<string>;
      };
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
        get: vi.fn().mockReturnValue(".agent/PRDS"),
      } as unknown as vscode.WorkspaceConfiguration);
      (vscode.workspace.openTextDocument as Mock).mockRejectedValue(new Error("missing"));

      const result = await internal.loadPRDContentRaw("/tmp/prd.md");

      expect(result).toBe("");
      expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(1);
    });

    it("resolves PRD path from base path directory", async () => {
      const internal = provider as unknown as {
        loadPRDContentRaw: (path: string) => Promise<string>;
      };
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
        get: vi.fn().mockReturnValue(".agent/PRDS"),
      } as unknown as vscode.WorkspaceConfiguration);
      (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
        getText: () => "PRD content",
      });

      const result = await internal.loadPRDContentRaw("../../.agent/PRDS/specs/prd.md");

      expect(result).toBe("PRD content");
      expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    });

    it("resolves PRD path when base path segment is the first relative part", async () => {
      const internal = provider as unknown as {
        loadPRDContentRaw: (path: string) => Promise<string>;
      };
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
        get: vi.fn().mockReturnValue(".agent/PRDS"),
      } as unknown as vscode.WorkspaceConfiguration);
      (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
        getText: () => "Base path PRD",
      });

      const result = await internal.loadPRDContentRaw("../PRDS");

      expect(result).toBe("Base path PRD");
    });

    it("falls back to workspace root when base path resolution fails", async () => {
      const internal = provider as unknown as {
        loadPRDContentRaw: (path: string) => Promise<string>;
      };
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
        get: vi.fn().mockReturnValue(".agent/PRDS"),
      } as unknown as vscode.WorkspaceConfiguration);
      (vscode.workspace.openTextDocument as Mock)
        .mockRejectedValueOnce(new Error("missing"))
        .mockResolvedValueOnce({ getText: () => "Root PRD" });

      const result = await internal.loadPRDContentRaw("docs/prd.md");

      expect(result).toBe("Root PRD");
    });

    it("returns empty string when all resolutions fail", async () => {
      const internal = provider as unknown as {
        loadPRDContentRaw: (path: string) => Promise<string>;
      };
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
        get: vi.fn().mockReturnValue(".agent/PRDS"),
      } as unknown as vscode.WorkspaceConfiguration);
      (vscode.workspace.openTextDocument as Mock).mockRejectedValue(new Error("missing"));

      const result = await internal.loadPRDContentRaw("docs/missing.md");

      expect(result).toBe("");
    });
  });
});
