# VS Code Extension Development Guide

**Purpose:** VS Code/Cursor extension-specific patterns, APIs, and best practices for this project.

---

## Extension Architecture

### Entry Point Pattern

**Standard Structure:**
```typescript
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // Register commands
  const command = vscode.commands.registerCommand("extension.command", handler);
  context.subscriptions.push(command);
}

export function deactivate() {
  // Cleanup if needed
}
```

**Key Points:**
- Always push disposables to `context.subscriptions`
- Use `ExtensionContext` for workspace state, secrets, global state
- Commands must be registered in `package.json` under `contributes.commands`

---

## Command Registration

### Registering Commands

**Pattern:**
```typescript
const command = vscode.commands.registerCommand(
  "kaiban.showBoard",
  async () => {
    try {
      // Command logic
    } catch (error) {
      vscode.window.showErrorMessage(`Failed: ${error}`);
    }
  }
);
context.subscriptions.push(command);
```

**Rules:**
- Command IDs must match `package.json` exactly
- Always handle errors with user-friendly messages
- Use async/await for async operations
- Show progress for long-running operations

---

## Webview Development

### Creating Webview Panels

**Pattern:**
```typescript
const panel = vscode.window.createWebviewPanel(
  "kanbanView",
  "Kanban Board",
  vscode.ViewColumn.One,
  {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, "out", "webview")
    ]
  }
);
```

**Key Settings:**
- `enableScripts: true` - Required for interactive webviews
- `retainContextWhenHidden: true` - Preserves state when panel is hidden
- `localResourceRoots` - Restricts resource loading for security

### Webview Content Security

**CSP Pattern:**
```typescript
const csp = `
  <meta http-equiv="Content-Security-Policy" 
        content="default-src 'none'; 
                 script-src 'unsafe-inline' ${webview.cspSource}; 
                 style-src 'unsafe-inline' ${webview.cspSource};">
`;
```

**Resource Loading:**
```typescript
// Convert local paths to webview URIs
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, "out", "webview", "script.js")
);
```

---

## Message Passing

### Extension → Webview

```typescript
panel.webview.postMessage({
  command: "updateTasks",
  tasks: taskData
});
```

### Webview → Extension

```typescript
panel.webview.onDidReceiveMessage(
  async (message) => {
    switch (message.command) {
      case "executeTask":
        await handleTaskExecution(message.data);
        break;
    }
  },
  undefined,
  context.subscriptions
);
```

**Pattern:**
- Use command-based message structure
- Always validate message data
- Handle errors gracefully
- Clean up listeners in subscriptions

---

## Configuration Management

### Reading Configuration

```typescript
const config = vscode.workspace.getConfiguration("kaiban");
const defaultProvider = config.get<string>("ai.defaultProvider", "openrouter");
const streamResponses = config.get<boolean>("ai.streamResponses", true);
```

### Watching Configuration Changes

```typescript
vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration("kaiban")) {
    // Reload configuration
    updateConfiguration();
  }
}, null, context.subscriptions);
```

---

## Secrets Management

### Using SecretStorage

```typescript
// Store secret
await context.secrets.store("kaiban.apiKey.openai", apiKey);

// Retrieve secret
const apiKey = await context.secrets.get("kaiban.apiKey.openai");

// Delete secret
await context.secrets.delete("kaiban.apiKey.openai");
```

**Pattern:**
- Use namespaced keys: `extensionName.category.key`
- Never log secrets
- Handle missing secrets gracefully
- Clear secrets on extension uninstall if needed

---

## File System Operations

### Reading Workspace Files

```typescript
const workspaceFolders = vscode.workspace.workspaceFolders;
if (!workspaceFolders) {
  vscode.window.showWarningMessage("No workspace folder open");
  return;
}

const tasksPath = vscode.Uri.joinPath(
  workspaceFolders[0].uri,
  ".agent",
  "TASKS"
);

const files = await vscode.workspace.fs.readDirectory(tasksPath);
```

### Watching File Changes

```typescript
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(workspaceFolder, ".agent/TASKS/**/*.md")
);

watcher.onDidChange((uri) => {
  // Handle file change
}, null, context.subscriptions);
```

---

## User Interactions

### Quick Pick (Dropdown)

```typescript
const items = providers.map((p) => ({
  label: p.name,
  description: p.description,
  provider: p
}));

const selected = await vscode.window.showQuickPick(items, {
  placeHolder: "Select a provider"
});

if (!selected) return; // User cancelled
```

### Input Box

```typescript
const apiKey = await vscode.window.showInputBox({
  prompt: "Enter your API key",
  password: true,
  placeHolder: "sk-...",
  validateInput: (value) => {
    if (!value.startsWith("sk-")) {
      return "API key must start with 'sk-'";
    }
    return null;
  }
});
```

### Information/Error Messages

```typescript
// Info (auto-dismiss)
vscode.window.showInformationMessage("Operation completed");

// Warning (user must dismiss)
vscode.window.showWarningMessage("This will delete data", "Delete", "Cancel");

// Error (user must dismiss)
vscode.window.showErrorMessage("Operation failed");
```

---

## Testing Extensions

### Mocking VS Code API

**Pattern (using Vitest):**
```typescript
import { vi } from "vitest";

vi.mock("vscode", () => ({
  window: {
    createWebviewPanel: vi.fn(),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
  },
  workspace: {
    workspaceFolders: undefined,
    getConfiguration: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
  },
}));
```

### Testing Commands

```typescript
// Test command registration
expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
  "kaiban.showBoard",
  expect.any(Function)
);

// Test command execution
const handler = vi.mocked(vscode.commands.registerCommand).mock.calls[0][1];
await handler();
```

---

## Extension Lifecycle

### Activation Events

**In `package.json`:**
```json
{
  "activationEvents": [
    "onCommand:kaiban.showBoard",
    "onStartupFinished"
  ]
}
```

**Best Practices:**
- Use `onCommand:*` for command-based activation
- Use `onStartupFinished` for extensions that need to run early
- Avoid `*` activation (activates too early)

### Deactivation

```typescript
export function deactivate() {
  // Clean up resources
  // Cancel timers
  // Close connections
  // Dispose of subscriptions
}
```

---

## Common Patterns

### Singleton Pattern for Providers

```typescript
export class KanbanViewProvider {
  private static instance: KanbanViewProvider | undefined;

  static getInstance(context: vscode.ExtensionContext): KanbanViewProvider {
    if (!this.instance) {
      this.instance = new KanbanViewProvider(context);
    }
    return this.instance;
  }
}
```

### Disposable Resources

```typescript
class Resource implements vscode.Disposable {
  private timer: NodeJS.Timeout;

  constructor() {
    this.timer = setInterval(() => {}, 1000);
  }

  dispose() {
    clearInterval(this.timer);
  }
}

// Register for cleanup
const resource = new Resource();
context.subscriptions.push(resource);
```

---

## Debugging Extensions

### Debug Console

- View in bottom panel when debugging
- Shows `console.log` output from extension
- Check for activation errors

### Developer Tools (for Webviews)

```typescript
// In Extension Development Host window
// Help > Toggle Developer Tools (Cmd+Option+I)
// Inspect webview elements
// Check console for webview errors
```

### Breakpoints

- Set breakpoints in TypeScript source files
- Use Debug sidebar to inspect variables
- Step through code execution

---

## Extension Development Workflow

### Development Cycle

1. **Edit** source files in `src/`
2. **Compile** with `bun run compile` or watch mode
3. **Launch** with `F5` (opens Extension Development Host)
4. **Test** in Extension Development Host window
5. **Reload** with `Cmd+R` in Extension Host (faster than restart)
6. **Repeat**

### Watch Mode

```bash
# Terminal: Auto-compile on changes
bun run watch

# Then press F5 to launch
# Changes auto-compile, just reload (Cmd+R) in Extension Host
```

---

## Project-Specific Patterns

### This Project's Structure

```
src/
├── extension.ts          # Entry point, command registration
├── kanbanView.ts         # Webview provider, main UI logic
├── taskParser.ts         # Markdown task parsing
├── adapters/             # AI provider adapters
├── config/               # Configuration (API keys, settings)
├── services/             # Core services (provider registry)
└── types/                # TypeScript definitions
```

### Key Files

- **`extension.ts`**: Registers all commands, initializes providers
- **`kanbanView.ts`**: Manages webview panel, handles messages, renders UI
- **`taskParser.ts`**: Parses `.agent/TASKS/*.md` files into task objects
- **`adapters/*.ts`**: Implement `AIProviderAdapter` interface for each provider

### Command IDs

All commands use `kaiban.*` prefix:
- `kaiban.showBoard`
- `kaiban.refreshBoard`
- `kaiban.configureProviders`
- `kaiban.setApiKey`
- `kaiban.clearApiKey`

---

## Common Mistakes to Avoid

### ❌ Don't Forget Subscriptions

```typescript
// WRONG: Command not cleaned up
vscode.commands.registerCommand("command", handler);

// CORRECT: Added to subscriptions
const command = vscode.commands.registerCommand("command", handler);
context.subscriptions.push(command);
```

### ❌ Don't Use Relative Paths for Resources

```typescript
// WRONG: Relative path won't work
panel.webview.html = `<img src="./image.png">`;

// CORRECT: Use asWebviewUri
const imageUri = webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, "out", "image.png")
);
panel.webview.html = `<img src="${imageUri}">`;
```

### ❌ Don't Block the UI Thread

```typescript
// WRONG: Blocks UI
const data = await longRunningOperation();
vscode.window.showInformationMessage("Done");

// CORRECT: Show progress
await vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: "Processing..."
}, async (progress) => {
  const data = await longRunningOperation();
});
```

---

## Resources

- [VS Code Extension API Docs](https://code.visualstudio.com/api/references/vscode-api)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)

---

**Remember:** When adding new features, check existing code in `src/extension.ts` and `src/kanbanView.ts` for patterns to follow.

