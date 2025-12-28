import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import * as vscode from "vscode";
import type { Task } from "./taskParser";

// Create mock functions at module level
const mockParseTasks = vi.fn().mockResolvedValue([]);
const mockGroupByStatus = vi.fn().mockReturnValue({
  Backlog: [],
  "To Do": [],
  Testing: [],
  Done: [],
});
const mockUpdateTaskStatus = vi.fn();
const mockRejectTask = vi.fn();

// Mock TaskParser before importing KanbanViewProvider
vi.mock("./taskParser", () => ({
  TaskParser: class {
    parseTasks = mockParseTasks;
    groupByStatus = mockGroupByStatus;
    updateTaskStatus = mockUpdateTaskStatus;
    rejectTask = mockRejectTask;
  },
}));

import { KanbanViewProvider } from "./kanbanView";

describe("KanbanViewProvider", () => {
  let provider: KanbanViewProvider;
  let mockContext: vscode.ExtensionContext;
  let mockPanel: vscode.WebviewPanel;
  let mockWebview: vscode.Webview;
  let messageHandler: (message: unknown) => Promise<void>;

  beforeEach(() => {
    // Reset all mocks
    mockParseTasks.mockClear().mockResolvedValue([]);
    mockGroupByStatus.mockClear().mockReturnValue({
      Backlog: [],
      "To Do": [],
      Testing: [],
      Done: [],
    });
    mockUpdateTaskStatus.mockClear();
    mockRejectTask.mockClear();
    vi.clearAllMocks();

    mockWebview = {
      html: "",
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
        "Kaiban Markdown",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
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
      expect(mockWebview.html).toContain("Kaiban Markdown");
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

    describe("loadPRD command", () => {
      it("should load PRD content successfully", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        (vscode.workspace.openTextDocument as Mock).mockResolvedValue({
          getText: () => "# PRD Content\n\n**Bold text**",
        });

        await messageHandler({ command: "loadPRD", prdPath: "./prd/test.md" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "updatePRDContent",
          content: expect.stringContaining("PRD Content"),
        });
      });

      it("should post not found message when PRD file not found", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        (vscode.workspace.openTextDocument as Mock).mockRejectedValue(new Error("Not found"));

        await messageHandler({ command: "loadPRD", prdPath: "./prd/test.md" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "updatePRDContent",
          content: expect.stringContaining("not found"),
        });
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

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "updatePRDContent",
          content: expect.stringContaining("Found in second"),
        });
      });

      it("should handle error during loadPRD content loading", async () => {
        vi.mocked(vscode.workspace).workspaceFolders = [
          { uri: { fsPath: "/workspace" } },
        ] as unknown as readonly vscode.WorkspaceFolder[];

        // Mock openTextDocument to throw an error that isn't caught in the inner try/catch
        (vscode.Uri.joinPath as Mock).mockImplementation(() => {
          throw new Error("URI error");
        });

        await messageHandler({ command: "loadPRD", prdPath: "./prd/test.md" });

        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "updatePRDContent",
          content: expect.stringContaining("Error loading PRD"),
        });

        // Restore the mock
        (vscode.Uri.joinPath as Mock).mockImplementation(
          (base: { fsPath: string }, ...paths: string[]) => ({
            fsPath: [base.fsPath, ...paths].join("/"),
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

    describe("rejectTask command", () => {
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
      await provider.show();

      expect(mockWebview.html).toContain("Backlog");
      expect(mockWebview.html).toContain("To Do");
      expect(mockWebview.html).toContain("Testing");
      expect(mockWebview.html).toContain("Done");
    });

    it("should show empty state messages", async () => {
      await provider.show();

      expect(mockWebview.html).toContain("No tasks in backlog");
      expect(mockWebview.html).toContain("No tasks to do");
      expect(mockWebview.html).toContain("No tasks in testing");
      expect(mockWebview.html).toContain("No completed tasks");
    });

    it("should render tasks with correct priority classes", async () => {
      const tasks: Task[] = [
        {
          id: "1",
          label: "High Task",
          priority: "High",
          status: "Backlog",
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
          status: "Backlog",
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
          status: "Backlog",
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
        Backlog: tasks,
        "To Do": [],
        Testing: [],
        Done: [],
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("priority-high");
      expect(mockWebview.html).toContain("priority-medium");
      expect(mockWebview.html).toContain("priority-low");
    });

    it("should show reject button for Testing tasks", async () => {
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
        Backlog: [],
        "To Do": [],
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
        Backlog: [],
        "To Do": [],
        Testing: tasks,
        Done: [],
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("agent-badge");
      expect(mockWebview.html).toContain("claude");
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
        Backlog: [],
        "To Do": tasks,
        Testing: [],
        Done: [],
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("rejection-badge");
    });

    it("should show completed indicator for done tasks", async () => {
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
        Backlog: [],
        "To Do": [],
        Testing: [],
        Done: tasks,
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("[Done]");
      expect(mockWebview.html).toContain("completed");
    });
  });

  describe("escapeHtml", () => {
    it("should escape ampersand", async () => {
      const tasks: Task[] = [
        {
          id: "1",
          label: "Task with & symbol",
          status: "Backlog",
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
        Backlog: tasks,
        "To Do": [],
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
          status: "Backlog",
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
        Backlog: tasks,
        "To Do": [],
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
          status: "Backlog",
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
        Backlog: tasks,
        "To Do": [],
        Testing: [],
        Done: [],
      });

      const newProvider = new KanbanViewProvider(mockContext);
      await newProvider.show();

      expect(mockWebview.html).toContain("&quot;quotes&quot;");
      expect(mockWebview.html).toContain("&#039;apostrophes&#039;");
    });
  });
});
