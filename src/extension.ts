import * as vscode from "vscode";
import { ApiKeyManager } from "./config/apiKeyManager";
import { KanbanViewProvider } from "./kanbanView";
import type { ProviderType } from "./types/aiProvider";

let kanbanView: KanbanViewProvider;
let apiKeyManager: ApiKeyManager;

export function activate(context: vscode.ExtensionContext) {
  // Check if running in Cursor (not VS Code)
  const appName = vscode.env.appName.toLowerCase();
  const isCursor = appName.includes("cursor");

  if (!isCursor) {
    vscode.window
      .showErrorMessage(
        "Kaiban Markdown requires Cursor IDE. This extension is not compatible with VS Code. Please install Cursor IDE from https://cursor.com",
        "Download Cursor"
      )
      .then((selection) => {
        if (selection === "Download Cursor") {
          vscode.env.openExternal(vscode.Uri.parse("https://cursor.com"));
        }
      });
    // Don't activate the extension - return early
    console.error("Kaiban Markdown: Extension requires Cursor IDE. Activation aborted.");
    return;
  }

  console.log("Kaiban Markdown extension activated");

  // Initialize API key manager
  apiKeyManager = new ApiKeyManager(context.secrets);

  kanbanView = new KanbanViewProvider(context, apiKeyManager);

  // Register command to show board
  const showBoardCommand = vscode.commands.registerCommand("kaiban.showBoard", async () => {
    try {
      await kanbanView.show();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to show Kaiban board: ${error}`);
    }
  });

  // Register command to refresh board
  const refreshBoardCommand = vscode.commands.registerCommand("kaiban.refreshBoard", async () => {
    try {
      await kanbanView.refresh();
      vscode.window.showInformationMessage("Kaiban board refreshed");
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to refresh board: ${error}`);
    }
  });

  // Register command to configure providers
  const configureProvidersCommand = vscode.commands.registerCommand(
    "kaiban.configureProviders",
    async () => {
      const providers: ProviderType[] = ["cursor", "openai", "openrouter", "replicate"];
      const items = await Promise.all(
        providers.map(async (p) => {
          const info = apiKeyManager.getProviderInfo(p);
          const hasKey = await apiKeyManager.hasApiKey(p);
          return {
            label: info.name,
            description: hasKey ? "$(check) Configured" : "$(circle-slash) Not configured",
            provider: p,
          };
        })
      );

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a provider to configure",
      });

      if (selected) {
        vscode.commands.executeCommand("kaiban.setApiKey", selected.provider);
      }
    }
  );

  // Register command to set API key
  const setApiKeyCommand = vscode.commands.registerCommand(
    "kaiban.setApiKey",
    async (provider?: ProviderType) => {
      // If no provider specified, ask user to select one
      if (!provider) {
        const providers: ProviderType[] = ["cursor", "openai", "openrouter", "replicate"];
        const items = providers.map((p) => ({
          label: apiKeyManager.getProviderInfo(p).name,
          provider: p,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: "Select a provider",
        });

        if (!selected) return;
        provider = selected.provider;
      }

      const info = apiKeyManager.getProviderInfo(provider);

      const apiKey = await vscode.window.showInputBox({
        prompt: `Enter your ${info.name} API key`,
        password: true,
        placeHolder: info.placeholder,
        validateInput: (value) => {
          const validation = apiKeyManager.validateKeyFormat(provider, value);
          return validation.valid ? null : validation.error;
        },
      });

      if (apiKey) {
        await apiKeyManager.setApiKey(provider, apiKey);
        vscode.window.showInformationMessage(`${info.name} API key saved securely`);
      }
    }
  );

  // Register command to clear API key
  const clearApiKeyCommand = vscode.commands.registerCommand("kaiban.clearApiKey", async () => {
    const providers: ProviderType[] = ["cursor", "openai", "openrouter", "replicate"];
    const items = await Promise.all(
      providers.map(async (p) => {
        const info = apiKeyManager.getProviderInfo(p);
        const hasKey = await apiKeyManager.hasApiKey(p);
        return {
          label: info.name,
          description: hasKey ? "$(check) Has API key" : "$(circle-slash) No API key",
          provider: p,
          hasKey,
        };
      })
    );

    const configuredItems = items.filter((i) => i.hasKey);
    if (configuredItems.length === 0) {
      vscode.window.showInformationMessage("No API keys configured");
      return;
    }

    const selected = await vscode.window.showQuickPick(configuredItems, {
      placeHolder: "Select a provider to clear API key",
    });

    if (selected) {
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to clear the ${selected.label} API key?`,
        { modal: true },
        "Clear"
      );

      if (confirm === "Clear") {
        await apiKeyManager.deleteApiKey(selected.provider);
        vscode.window.showInformationMessage(`${selected.label} API key cleared`);
      }
    }
  });

  // Register command to configure PRD base path
  const configurePRDPathCommand = vscode.commands.registerCommand(
    "kaiban.configurePRDPath",
    async () => {
      const allValidColumns = ["Backlog", "To Do", "Doing", "Testing", "Done", "Blocked"];
      const columnsConfig = vscode.workspace.getConfiguration("kaiban.columns");
      const prdConfig = vscode.workspace.getConfiguration("kaiban.prd");

      // Show quick pick for configuration options
      const configOption = await vscode.window.showQuickPick(
        [
          {
            label: "Configure AI Providers",
            description: "Set up API keys for Cursor, OpenAI, OpenRouter, or Replicate",
            option: "apiKeys",
          },
          {
            label: "Configure Columns",
            description: "Select which columns to display on the Kanban board",
            option: "columns",
          },
          {
            label: "Configure PRD Base Path",
            description: "Set the base path for PRD files",
            option: "prd",
          },
        ],
        {
          placeHolder: "Select a configuration option",
        }
      );

      if (!configOption) return;

      if (configOption.option === "apiKeys") {
        // Configure API keys
        await vscode.commands.executeCommand("kaiban.configureProviders");
      } else if (configOption.option === "columns") {
        // Configure columns
        const currentColumns = columnsConfig.get<string[]>("enabled", [
          "To Do",
          "Doing",
          "Testing",
          "Done",
        ]);

        const columnItems = allValidColumns.map((col) => ({
          label: col,
          picked: currentColumns.includes(col),
        }));

        const selected = await vscode.window.showQuickPick(columnItems, {
          placeHolder: "Select columns to display (use Ctrl/Cmd+Click to select multiple)",
          canPickMany: true,
        });

        if (selected !== undefined) {
          const selectedColumns = selected.map((item) => item.label);
          if (selectedColumns.length > 0) {
            await columnsConfig.update(
              "enabled",
              selectedColumns,
              vscode.ConfigurationTarget.Workspace
            );
            // Manually refresh the board immediately (configuration listener may have delay)
            await kanbanView.refresh();
            vscode.window.showInformationMessage(`Columns updated: ${selectedColumns.join(", ")}`);
          } else {
            vscode.window.showWarningMessage("At least one column must be selected.");
          }
        }
      } else if (configOption.option === "prd") {
        // Configure PRD path
        const currentPath = prdConfig.get<string>("basePath", ".agent/PRDS");

        const newPath = await vscode.window.showInputBox({
          prompt: "Enter the base path for PRD files (relative to workspace root)",
          value: currentPath,
          placeHolder: ".agent/PRDS",
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Path cannot be empty";
            }
            // Remove leading/trailing slashes
            const cleanPath = value.trim().replace(/^\/+|\/+$/g, "");
            if (cleanPath.length === 0) {
              return "Invalid path";
            }
            return null;
          },
        });

        if (newPath !== undefined) {
          // Clean up the path (remove leading/trailing slashes)
          const cleanPath = newPath.trim().replace(/^\/+|\/+$/g, "");
          await prdConfig.update("basePath", cleanPath, vscode.ConfigurationTarget.Workspace);
          vscode.window.showInformationMessage(
            `PRD base path updated to: ${cleanPath}. Refresh the board to apply changes.`
          );
        }
      }
    }
  );

  context.subscriptions.push(
    showBoardCommand,
    refreshBoardCommand,
    configureProvidersCommand,
    setApiKeyCommand,
    clearApiKeyCommand,
    configurePRDPathCommand
  );

  // Show welcome message
  vscode.window
    .showInformationMessage(
      'Kaiban Markdown is ready! Use "Kaiban: Show Markdown Board" command to open.',
      "Open Board"
    )
    .then((selection) => {
      if (selection === "Open Board") {
        vscode.commands.executeCommand("kaiban.showBoard");
      }
    });
}

export function deactivate() {
  console.log("Kaiban Markdown extension deactivated");
}
