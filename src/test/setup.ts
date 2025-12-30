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
          postMessage: vi.fn(),
          onDidReceiveMessage: vi.fn(() => mockDisposable),
        },
        onDidDispose: vi.fn(() => mockDisposable),
      })),
      showInformationMessage: vi.fn().mockResolvedValue(undefined),
      showErrorMessage: vi.fn().mockResolvedValue(undefined),
      showTextDocument: vi.fn().mockResolvedValue(undefined),
      showQuickPick: vi.fn().mockResolvedValue(undefined),
      showInputBox: vi.fn().mockResolvedValue(undefined),
    },
    workspace: {
      workspaceFolders: undefined,
      openTextDocument: vi.fn().mockResolvedValue({}),
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(""),
      }),
      onDidChangeConfiguration: vi.fn(() => mockDisposable),
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
    extensions: {
      getExtension: vi.fn().mockReturnValue(undefined),
    },
    env: {
      appName: "Cursor", // Pretend we're running in Cursor IDE
      openExternal: vi.fn().mockResolvedValue(undefined),
    },
  };
});
