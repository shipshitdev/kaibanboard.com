import * as vscode from "vscode";

export interface SkillSettings {
  useAgentFolderInit: boolean;
  useTaskPrdCreator: boolean;
  useSessionDocumenter: boolean;
}

/**
 * Service for managing Claude Code skill integrations.
 * Skills are Claude Code plugins that users install via Claude CLI.
 * This service checks settings and provides methods to invoke skills.
 */
export class SkillService {
  /**
   * Get current skill settings from configuration
   */
  getSettings(): SkillSettings {
    const config = vscode.workspace.getConfiguration("kaiban.skills");
    return {
      useAgentFolderInit: config.get<boolean>("useAgentFolderInit", false),
      useTaskPrdCreator: config.get<boolean>("useTaskPrdCreator", false),
      useSessionDocumenter: config.get<boolean>("useSessionDocumenter", false),
    };
  }



  /**
   * Run agent-folder-init skill via Claude CLI
   * Creates .agent/ folder structure for a project
   */
  async runAgentFolderInit(projectName: string): Promise<vscode.Terminal> {
    const config = vscode.workspace.getConfiguration("kaiban.claude");
    const claudePath = config.get<string>("executablePath", "claude");
    const flags = config.get<string>("additionalFlags", "");

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const cwd = workspaceFolders?.[0]?.uri.fsPath;

    const terminal = vscode.window.createTerminal({
      name: "Agent Folder Init",
      cwd: cwd,
    });

    const prompt = `/shipshitdev-full:agent-folder-init "${projectName}"`;
    const command = `${claudePath} ${flags ? `${flags} ` : ""}"${prompt}"`;

    terminal.show();
    terminal.sendText(command);

    return terminal;
  }

  /**
   * Run task-prd-creator skill via Claude CLI
   * Creates task and PRD files for a given title/description
   */
  async runTaskPrdCreator(options: {
    title: string;
    description?: string;
    category?: string;
    taskPath: string;
    prdPath: string;
  }): Promise<vscode.Terminal> {
    const config = vscode.workspace.getConfiguration("kaiban.claude");
    const claudePath = config.get<string>("executablePath", "claude");
    const flags = config.get<string>("additionalFlags", "");

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const cwd = workspaceFolders?.[0]?.uri.fsPath;

    const terminal = vscode.window.createTerminal({
      name: `Create Task: ${options.title.substring(0, 20)}`,
      cwd: cwd,
    });

    const prompt = `Create a task and PRD for: "${options.title}"
${options.description ? `Description: ${options.description}` : ""}
${options.category ? `Category: ${options.category}` : ""}

Save files to:
- Task: ${options.taskPath}
- PRD: ${options.prdPath}

Use standard task format with frontmatter (id, label, type, priority, status, prd_path).
Use comprehensive PRD format with problem, solution, requirements, and acceptance criteria.`;

    const command = `${claudePath} ${flags ? `${flags} ` : ""}"${this.escapeForShell(prompt)}"`;

    terminal.show();
    terminal.sendText(command);

    return terminal;
  }

  /**
   * Run session-documenter skill via Claude CLI
   * Documents a completed task in the session file
   */
  async runSessionDocumenter(taskLabel: string): Promise<vscode.Terminal> {
    const config = vscode.workspace.getConfiguration("kaiban.claude");
    const claudePath = config.get<string>("executablePath", "claude");
    const flags = config.get<string>("additionalFlags", "");

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const cwd = workspaceFolders?.[0]?.uri.fsPath;

    const terminal = vscode.window.createTerminal({
      name: "Document Session",
      cwd: cwd,
    });

    const prompt = `/shipshitdev-full:end "${taskLabel}"`;
    const command = `${claudePath} ${flags ? `${flags} ` : ""}"${prompt}"`;

    terminal.show();
    terminal.sendText(command);

    return terminal;
  }

  /**
   * Escape string for shell command
   */
  private escapeForShell(str: string): string {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`");
  }
}
