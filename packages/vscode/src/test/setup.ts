import { vi } from "vitest";

// Mock VS Code API
vi.mock("vscode", () => {
  const mockDisposable = { dispose: vi.fn() };

  return {
    window: {
      createWebviewPanel: vi.fn(() => ({
        reveal: vi.fn(),
        dispose: vi.fn(),
        webview: {
          html: "",
          asWebviewUri: vi.fn((uri: unknown) => uri),
          postMessage: vi.fn(),
          onDidReceiveMessage: vi.fn(() => mockDisposable),
        },
        onDidDispose: vi.fn(() => mockDisposable),
      })),
      showInformationMessage: vi.fn().mockResolvedValue(undefined),
      showErrorMessage: vi.fn().mockResolvedValue(undefined),
      showWarningMessage: vi.fn().mockResolvedValue(undefined),
      showTextDocument: vi.fn().mockResolvedValue(undefined),
      showQuickPick: vi.fn().mockResolvedValue(undefined),
      showInputBox: vi.fn().mockResolvedValue(undefined),
      createTerminal: vi.fn(() => ({
        show: vi.fn(),
        sendText: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    workspace: {
      workspaceFolders: undefined,
      fs: {
        createDirectory: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
      },
      openTextDocument: vi.fn().mockResolvedValue({}),
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(""),
        update: vi.fn().mockResolvedValue(undefined),
      }),
      onDidChangeConfiguration: vi.fn(() => mockDisposable),
      createFileSystemWatcher: vi.fn(() => ({
        onDidChange: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    commands: {
      registerCommand: vi.fn(() => mockDisposable),
      executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    Uri: {
      file: vi.fn((path: string) => ({ fsPath: path })),
      joinPath: vi.fn((base: { fsPath: string }, ...paths: string[]) => ({
        fsPath: [base.fsPath, ...paths].join("/"),
      })),
      parse: vi.fn((uri: string) => ({ toString: () => uri })),
    },
    ViewColumn: {
      One: 1,
      Two: 2,
      Three: 3,
    },
    RelativePattern: class {
      constructor(
        public base: { fsPath: string },
        public pattern: string
      ) {}
    },
    ConfigurationTarget: {
      Workspace: 1,
    },
    extensions: {
      getExtension: vi.fn().mockReturnValue(undefined),
    },
    env: {
      appName: "Cursor", // Pretend we're running in Cursor IDE
      openExternal: vi.fn().mockResolvedValue(undefined),
    },
  };
});
