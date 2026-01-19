import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { KanbanViewProvider } from "./kanbanView";
import { SkillService } from "./services/skillService";
import { getPRDBasePath, getTasksBasePath, getWorkspaceFolder } from "./utils/fileUtils";

let kanbanView: KanbanViewProvider;

export function activate(context: vscode.ExtensionContext) {
  // Check if running in Cursor (not VS Code)
  const appName = vscode.env.appName.toLowerCase();
  const isCursor = appName.includes("cursor");

  if (!isCursor) {
    vscode.window
      .showErrorMessage(
        "Kaiban Board requires Cursor IDE. This extension is not compatible with VS Code. Please install Cursor IDE from https://cursor.com",
        "Download Cursor"
      )
      .then((selection) => {
        if (selection === "Download Cursor") {
          vscode.env.openExternal(vscode.Uri.parse("https://cursor.com"));
        }
      });
    // Don't activate the extension - return early
    console.error("Kaiban Board: Extension requires Cursor IDE. Activation aborted.");
    return;
  }

  console.log("Kaiban Board extension activated");

  kanbanView = new KanbanViewProvider(context);

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

  // Register command to create PRD via Claude CLI
  const createPRDCommand = vscode.commands.registerCommand("kaiban.createPRD", async () => {
    try {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      // Get Claude CLI configuration
      const config = vscode.workspace.getConfiguration("kaiban");
      const claudePath = config.get<string>("claude.executablePath", "claude");
      const additionalFlags = config.get<string>("claude.additionalFlags", "");
      const prdBasePath = getPRDBasePath(workspaceFolder);

      // Build the prompt for Claude to interactively create a PRD
      const prompt = `Help me create a Product Requirements Document (PRD).

Ask me the following questions one at a time:
1. What is the feature or product name?
2. What problem does it solve? (Overview)
3. What are the main goals? (2-3 bullet points)
4. What are the key requirements? (numbered list)
5. What are the acceptance criteria? (checklist format)
6. Any technical notes or constraints?

After gathering all information, create a PRD file at ${prdBasePath}/<slug-based-on-title>.md with this structure:
- # <Title> - Product Requirements Document
- ## Overview
- ## Goals
- ## Requirements
- ## Acceptance Criteria
- ## Technical Notes

Important: Create the directory if it doesn't exist. Use a kebab-case filename based on the title.`;

      // Build command
      const flags = additionalFlags ? `${additionalFlags} ` : "";
      const fullCommand = `${claudePath} ${flags}"${prompt.replace(/"/g, '\\"')}"`;

      // Get workspace path for terminal cwd
      const cwd = workspaceFolder.uri.fsPath;

      // Create terminal
      const terminal = vscode.window.createTerminal({
        name: "Claude: Create PRD",
        cwd: cwd,
      });

      terminal.show();
      terminal.sendText(fullCommand);

      vscode.window.showInformationMessage(
        "Claude CLI opened - follow the prompts to create your PRD"
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to start PRD creation: ${error}`);
    }
  });

  // Register command to create Task via Claude CLI
  const createTaskCommand = vscode.commands.registerCommand("kaiban.createTask", async () => {
    try {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      // Get Claude CLI configuration
      const config = vscode.workspace.getConfiguration("kaiban");
      const claudePath = config.get<string>("claude.executablePath", "claude");
      const additionalFlags = config.get<string>("claude.additionalFlags", "");
      const tasksBasePath = getTasksBasePath(workspaceFolder);
      const prdBasePath = getPRDBasePath(workspaceFolder);

      // Build the prompt for Claude to interactively create a Task
      const prompt = `Help me create a Task for my Kanban board.

Ask me the following questions one at a time:
1. What is the task title?
2. What is the task description?
3. What type is it? (Feature, Bug, Enhancement, or Research)
4. What priority? (High, Medium, or Low)
5. What status should it start in? (Backlog, Planning, In Progress, AI Review, Human Review, Done, Archived, or Blocked)
6. Should this task be linked to an existing PRD? If so, which one? (Check ${prdBasePath} for existing PRDs)

After gathering all information, create a task file at ${tasksBasePath}/<slug-based-on-title>.md with this exact structure:

## Task: <Title>

**ID:** task-<timestamp>
**Label:** <Title>
**Description:** <Description>
**Type:** <Type>
**Status:** <Status>
**Priority:** <Priority>
**Created:** <YYYY-MM-DD>
**Updated:** <YYYY-MM-DD>
**PRD:** [Link](<relative-path-to-prd>) or empty if no PRD

---

## Additional Notes

<Any additional context or notes>

Important: Create the directory if it doesn't exist. Use a kebab-case filename based on the title. Generate a unique task ID using the current timestamp.`;

      // Build command
      const flags = additionalFlags ? `${additionalFlags} ` : "";
      const fullCommand = `${claudePath} ${flags}"${prompt.replace(/"/g, '\\"')}"`;

      // Get workspace path for terminal cwd
      const cwd = workspaceFolder.uri.fsPath;

      // Create terminal
      const terminal = vscode.window.createTerminal({
        name: "Claude: Create Task",
        cwd: cwd,
      });

      terminal.show();
      terminal.sendText(fullCommand);

      vscode.window.showInformationMessage(
        "Claude CLI opened - follow the prompts to create your task"
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to start task creation: ${error}`);
    }
  });

  // Register command to configure board settings
  const configureCommand = vscode.commands.registerCommand("kaiban.configure", async () => {
    const allValidColumns = [
      "Backlog",
      "Planning",
      "In Progress",
      "AI Review",
      "Human Review",
      "Done",
      "Archived",
      "Blocked",
    ];
    const columnsConfig = vscode.workspace.getConfiguration("kaiban.columns");
    const prdConfig = vscode.workspace.getConfiguration("kaiban.prd");
    const taskConfig = vscode.workspace.getConfiguration("kaiban.task");

    // Show quick pick for configuration options
    const configOption = await vscode.window.showQuickPick(
      [
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
        {
          label: "Configure Task Base Path",
          description: "Set the base path for task files",
          option: "task",
        },
      ],
      {
        placeHolder: "Select a configuration option",
      }
    );

    if (!configOption) return;

    if (configOption.option === "columns") {
      // Configure columns
      const currentColumns = columnsConfig.get<string[]>("enabled", [
        "Backlog",
        "Planning",
        "In Progress",
        "AI Review",
        "Human Review",
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
          // Manually refresh the board immediately
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
          const cleanPath = value.trim().replace(/^\/+|\/+$/g, "");
          if (cleanPath.length === 0) {
            return "Invalid path";
          }
          return null;
        },
      });

      if (newPath !== undefined) {
        const cleanPath = newPath.trim().replace(/^\/+|\/+$/g, "");
        await prdConfig.update("basePath", cleanPath, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(
          `PRD base path updated to: ${cleanPath}. Refresh the board to apply changes.`
        );
      }
    } else if (configOption.option === "task") {
      // Configure Task path
      const currentPath = taskConfig.get<string>("basePath", ".agent/TASKS");

      const newPath = await vscode.window.showInputBox({
        prompt: "Enter the base path for task files (relative to workspace root)",
        value: currentPath,
        placeHolder: ".agent/TASKS",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Path cannot be empty";
          }
          const cleanPath = value.trim().replace(/^\/+|\/+$/g, "");
          if (cleanPath.length === 0) {
            return "Invalid path";
          }
          return null;
        },
      });

      if (newPath !== undefined) {
        const cleanPath = newPath.trim().replace(/^\/+|\/+$/g, "");
        await taskConfig.update("basePath", cleanPath, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(
          `Task base path updated to: ${cleanPath}. Refresh the board to apply changes.`
        );
      }
    }
  });

  context.subscriptions.push(
    showBoardCommand,
    refreshBoardCommand,
    configureCommand,
    createPRDCommand,
    createTaskCommand
  );

  // Show welcome message
  vscode.window
    .showInformationMessage(
      'Kaiban Board is ready! Use "Kaiban: Show Board" command to open.',
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
    // .agent exists - check for missing subfolders
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
 * Create basic .agent folder structure
 */
async function createBasicAgentStructure(agentPath: string, folders: string[]): Promise<void> {
  try {
    fs.mkdirSync(agentPath, { recursive: true });

    for (const folder of folders) {
      fs.mkdirSync(path.join(agentPath, folder), { recursive: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create agent folder structure: ${message}`);
  }

  try {
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

### Next steps

- [ ] Next task 1
- [ ] Next task 2

---

**Total sessions today:** 1
`;
    fs.writeFileSync(templatePath, templateContent, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to create template files: ${message}`);
  }
}

export function deactivate() {
  if (kanbanView) {
    kanbanView.dispose();
  }
  console.log("Kaiban Board extension deactivated");
}
