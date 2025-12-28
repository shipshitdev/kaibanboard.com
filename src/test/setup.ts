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
    },
    workspace: {
      workspaceFolders: undefined,
      openTextDocument: vi.fn().mockResolvedValue({}),
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
    },
    ViewColumn: {
      One: 1,
      Two: 2,
      Three: 3,
    },
  };
});
