import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { CursorCloudAdapter } from "./adapters/cursorCloudAdapter";
import { OpenAIAdapter } from "./adapters/openaiAdapter";
import { OpenRouterAdapter } from "./adapters/openrouterAdapter";
import { ReplicateAdapter } from "./adapters/replicateAdapter";
import { ApiKeyManager } from "./config/apiKeyManager";
import { KanbanViewProvider } from "./kanbanView";
import { generatePRD, generateSimplePRDTemplate } from "./services/prdGenerator";
import { ProviderRegistry } from "./services/providerRegistry";
import { SkillService } from "./services/skillService";
import { generateSimpleTaskTemplate, generateTask } from "./services/taskGenerator";
import type { ProviderType } from "./types/aiProvider";
import {
  createFile,
  ensureDirectoryExists,
  generateUniqueFileName,
  getPRDBasePath,
  getTasksBasePath,
  getWorkspaceFolder,
  slugify,
} from "./utils/fileUtils";

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

  // Register command to create PRD
  const createPRDCommand = vscode.commands.registerCommand("kaiban.createPRD", async () => {
    try {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      // Prompt for PRD title
      const title = await vscode.window.showInputBox({
        prompt: "Enter PRD title",
        placeHolder: "e.g., User Authentication System",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Title cannot be empty";
          }
          return null;
        },
      });

      if (!title) {
        return;
      }

      // Prompt for description (optional)
      const description = await vscode.window.showInputBox({
        prompt: "Enter PRD description (optional)",
        placeHolder: "Brief description of what this PRD covers",
      });

      // Check if AI providers are available
      const hasProviders = await providerRegistry
        .getEnabledAdapters()
        .then((adapters) => adapters.length > 0);

      let prdContent: string;
      let useAI = false;

      if (hasProviders) {
        // Ask user if they want to use AI
        const useAIChoice = await vscode.window.showQuickPick(
          [
            { label: "Yes", description: "Use AI to generate PRD content" },
            { label: "No", description: "Create template only" },
          ],
          {
            placeHolder: "Use AI to generate PRD content?",
          }
        );

        useAI = useAIChoice?.label === "Yes";
      }

      if (useAI) {
        try {
          vscode.window.showInformationMessage("Generating PRD with AI...");
          const generated = await generatePRD(providerRegistry, {
            title,
            description: description || undefined,
          });
          prdContent = generated.content;
          vscode.window.showInformationMessage(
            `PRD generated using ${generated.provider}${generated.model ? ` (${generated.model})` : ""}`
          );
        } catch (error) {
          vscode.window.showWarningMessage(
            `AI generation failed: ${error}. Creating template instead.`
          );
          prdContent = generateSimplePRDTemplate(title, description || undefined);
        }
      } else {
        prdContent = generateSimplePRDTemplate(title, description || undefined);
      }

      // Generate file name
      const slug = slugify(title);
      const prdBasePath = getPRDBasePath(workspaceFolder);
      await ensureDirectoryExists(prdBasePath);

      const fileName = generateUniqueFileName(prdBasePath, `${slug}-prd`, ".md");
      const filePath = `${prdBasePath}/${fileName}`;

      // Create file
      await createFile(filePath, prdContent);

      // Show success message
      vscode.window.showInformationMessage(`PRD created: ${fileName}`);

      // Open the file
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);

      // Refresh board if it's open
      if (kanbanView) {
        await kanbanView.refresh();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create PRD: ${error}`);
    }
  });

  // Register command to create Task
  const createTaskCommand = vscode.commands.registerCommand("kaiban.createTask", async () => {
    try {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      // Prompt for task title
      const title = await vscode.window.showInputBox({
        prompt: "Enter task title",
        placeHolder: "e.g., Implement user authentication",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Title cannot be empty";
          }
          return null;
        },
      });

      if (!title) {
        return;
      }

      // Prompt for description (optional)
      const description = await vscode.window.showInputBox({
        prompt: "Enter task description (optional)",
        placeHolder: "Brief description of the task",
      });

      // Prompt for type
      const typeChoice = await vscode.window.showQuickPick(
        [
          { label: "Feature", value: "Feature" },
          { label: "Bug", value: "Bug" },
          { label: "Enhancement", value: "Enhancement" },
          { label: "Research", value: "Research" },
        ],
        {
          placeHolder: "Select task type",
        }
      );

      if (!typeChoice) {
        return;
      }

      // Prompt for priority
      const priorityChoice = await vscode.window.showQuickPick(
        [
          { label: "High", value: "High" },
          { label: "Medium", value: "Medium" },
          { label: "Low", value: "Low" },
        ],
        {
          placeHolder: "Select priority",
        }
      );

      if (!priorityChoice) {
        return;
      }

      // Prompt for status
      const statusChoice = await vscode.window.showQuickPick(
        [
          { label: "Backlog", value: "Backlog" },
          { label: "To Do", value: "To Do" },
          { label: "Doing", value: "Doing" },
          { label: "Testing", value: "Testing" },
          { label: "Done", value: "Done" },
          { label: "Blocked", value: "Blocked" },
        ],
        {
          placeHolder: "Select status",
        }
      );

      if (!statusChoice) {
        return;
      }

      // Check if AI providers are available
      const hasProviders = await providerRegistry
        .getEnabledAdapters()
        .then((adapters) => adapters.length > 0);

      let taskContent: string;
      let useAI = false;
      let taskId = `task-${Date.now().toString(36)}`;

      if (hasProviders) {
        // Ask user if they want to use AI
        const useAIChoice = await vscode.window.showQuickPick(
          [
            { label: "Yes", description: "Use AI to generate task description" },
            { label: "No", description: "Create template only" },
          ],
          {
            placeHolder: "Use AI to generate task description?",
          }
        );

        useAI = useAIChoice?.label === "Yes";
      }

      if (useAI) {
        try {
          vscode.window.showInformationMessage("Generating task with AI...");
          const generated = await generateTask(providerRegistry, {
            title,
            description: description || undefined,
            type: typeChoice.value as "Feature" | "Bug" | "Enhancement" | "Research",
            priority: priorityChoice.value as "High" | "Medium" | "Low",
            status: statusChoice.value as
              | "Backlog"
              | "To Do"
              | "Doing"
              | "Testing"
              | "Done"
              | "Blocked",
          });
          taskContent = generated.content;
          taskId = generated.id;
          vscode.window.showInformationMessage(
            `Task generated using ${generated.provider}${generated.model ? ` (${generated.model})` : ""}`
          );
        } catch (error) {
          vscode.window.showWarningMessage(
            `AI generation failed: ${error}. Creating template instead.`
          );
          taskContent = generateSimpleTaskTemplate({
            id: taskId,
            label: title,
            description: description || undefined,
            type: typeChoice.value,
            priority: priorityChoice.value,
            status: statusChoice.value,
          });
        }
      } else {
        taskContent = generateSimpleTaskTemplate({
          id: taskId,
          label: title,
          description: description || undefined,
          type: typeChoice.value,
          priority: priorityChoice.value,
          status: statusChoice.value,
        });
      }

      // Generate file name
      const slug = slugify(title);
      const tasksBasePath = getTasksBasePath(workspaceFolder);
      await ensureDirectoryExists(tasksBasePath);

      const fileName = generateUniqueFileName(tasksBasePath, slug, ".md");
      const filePath = `${tasksBasePath}/${fileName}`;

      // Create file
      await createFile(filePath, taskContent);

      // Show success message
      vscode.window.showInformationMessage(`Task created: ${fileName}`);

      // Open the file
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);

      // Refresh board if it's open
      if (kanbanView) {
        await kanbanView.refresh();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create task: ${error}`);
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

  // Create provider registry for AI generation
  const providerRegistry = new ProviderRegistry(apiKeyManager);

  // Register adapters for provider registry
  providerRegistry.registerAdapter(
    new OpenRouterAdapter(() => apiKeyManager.getApiKey("openrouter"))
  );
  providerRegistry.registerAdapter(new OpenAIAdapter(() => apiKeyManager.getApiKey("openai")));
  providerRegistry.registerAdapter(new CursorCloudAdapter(() => apiKeyManager.getApiKey("cursor")));
  providerRegistry.registerAdapter(
    new ReplicateAdapter(() => apiKeyManager.getApiKey("replicate"))
  );

  context.subscriptions.push(
    showBoardCommand,
    refreshBoardCommand,
    configureProvidersCommand,
    setApiKeyCommand,
    clearApiKeyCommand,
    configurePRDPathCommand,
    createPRDCommand,
    createTaskCommand
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

  // Check for .agent folder and offer to initialize
  checkAgentFolderInit(context);
}

/**
 * Check if .agent folder exists and offer to create it
 * Uses agent-folder-init skill if enabled, otherwise creates basic structure
 */
async function checkAgentFolderInit(_context: vscode.ExtensionContext) {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) return;

  const agentPath = path.join(workspaceFolder.uri.fsPath, ".agent");
  const skillService = new SkillService();
  const skillSettings = skillService.getSettings();

  // Required subfolders
  const requiredFolders = ["TASKS", "PRDS", "SESSIONS", "SYSTEM"];

  if (!fs.existsSync(agentPath)) {
    // No .agent folder - offer to create
    const result = await vscode.window.showInformationMessage(
      "No .agent folder found. Initialize project structure for Kaiban Board?",
      "Initialize",
      "Skip"
    );

    if (result === "Initialize") {
      if (skillSettings.useAgentFolderInit) {
        // Use skill via Claude CLI
        const projectName = path.basename(workspaceFolder.uri.fsPath);
        await skillService.runAgentFolderInit(projectName);
        vscode.window.showInformationMessage("Running agent-folder-init via Claude CLI...");
      } else {
        // Create basic structure directly
        await createBasicAgentStructure(agentPath, requiredFolders);
        vscode.window.showInformationMessage(".agent folder structure created successfully!");
      }
    }
  } else {
    // .agent exists - check for missing subfolders (don't override existing)
    const missing = requiredFolders.filter((f) => !fs.existsSync(path.join(agentPath, f)));

    if (missing.length > 0) {
      const result = await vscode.window.showInformationMessage(
        `Missing .agent subfolders: ${missing.join(", ")}. Create them?`,
        "Create",
        "Skip"
      );

      if (result === "Create") {
        for (const folder of missing) {
          fs.mkdirSync(path.join(agentPath, folder), { recursive: true });
        }
        vscode.window.showInformationMessage(`Created missing folders: ${missing.join(", ")}`);
      }
    }
  }
}

/**
 * Create basic .agent folder structure without using skills
 */
async function createBasicAgentStructure(agentPath: string, folders: string[]) {
  // Create main .agent folder
  fs.mkdirSync(agentPath, { recursive: true });

  // Create subfolders
  for (const folder of folders) {
    fs.mkdirSync(path.join(agentPath, folder), { recursive: true });
  }

  // Create basic CLAUDE.md file
  const claudeMdPath = path.join(path.dirname(agentPath), "CLAUDE.md");
  if (!fs.existsSync(claudeMdPath)) {
    const claudeMdContent = `# ${path.basename(path.dirname(agentPath))}

Claude-specific entry point. Documentation in \`.agent/\`.

## Commands

Check \`.agent/SYSTEM/RULES.md\` for coding standards.

## Sessions

Document all work in \`.agent/SESSIONS/YYYY-MM-DD.md\` (one file per day).
`;
    fs.writeFileSync(claudeMdPath, claudeMdContent, "utf-8");
  }

  // Create basic RULES.md
  const rulesPath = path.join(agentPath, "SYSTEM", "RULES.md");
  const rulesContent = `# Coding Standards

## General

- Follow existing code patterns
- Write clean, readable code
- Add comments for complex logic

## Testing

- Test all new features
- Run tests before committing

## Documentation

- Document public APIs
- Update README for major changes
`;
  fs.writeFileSync(rulesPath, rulesContent, "utf-8");

  // Create session template
  const templatePath = path.join(agentPath, "SESSIONS", "TEMPLATE.md");
  const templateContent = `# Sessions: YYYY-MM-DD

**Summary:** Brief 3-5 word summary

---

## Session 1: Brief Description

**Duration:** ~X hours
**Status:** Complete / In Progress

### What was done

- Task 1
- Task 2

### Files changed

- \`path/to/file.ts\` - what changed

### Decisions

- **Decision:** What was decided
  - **Context:** Why this was needed
  - **Rationale:** Why this choice

### Mistakes and fixes

- **Mistake:** What went wrong
- **Fix:** How resolved
- **Prevention:** How to avoid

### Next steps

- [ ] Next task 1
- [ ] Next task 2

---

**Total sessions today:** 1
`;
  fs.writeFileSync(templatePath, templateContent, "utf-8");
}

export function deactivate() {
  console.log("Kaiban Markdown extension deactivated");
}
