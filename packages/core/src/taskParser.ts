/**
 * Core task parser - VS Code independent
 * Can be used by both the extension and CLI
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  GitHubMetadata,
  Task,
  TaskParserConfig,
  TaskStatus,
  TaskWorktreeMetadata,
  WorktreeStatus,
} from "./types";

export class CoreTaskParser {
  private workspaceDirs: Array<{ path: string; name: string }>;
  protected config: TaskParserConfig;

  constructor(workspaceDirs: Array<{ path: string; name: string }>, config: TaskParserConfig = {}) {
    this.workspaceDirs = workspaceDirs;
    this.config = config;
  }

  /**
   * Get the PRD base path from config
   */
  protected getPrdBasePath(): string {
    return this.config.prdBasePath || ".agent/PRDS";
  }

  /**
   * Parse a structured task file
   * Format: ## Task: Title with metadata sections
   */
  private parseStructuredTask(content: string, filePath: string, projectName: string): Task | null {
    const lines = content.split("\n");

    const titleMatch = lines[0].match(/^## Task:\s*(.+)$/);
    if (!titleMatch) {
      return null;
    }

    const label = titleMatch[1].trim();
    const metadata: Record<string, string | number | boolean> = {};
    let inMetadataSection = false;

    for (const line of lines) {
      if (line.startsWith("**ID:**")) {
        inMetadataSection = true;
        const match = line.match(/^\*\*ID:\*\*\s*(.+)$/);
        if (match) metadata.id = match[1].trim();
      } else if (line.startsWith("**Label:**")) {
        const match = line.match(/^\*\*Label:\*\*\s*(.+)$/);
        if (match) metadata.label = match[1].trim();
      } else if (line.startsWith("**Description:**")) {
        const match = line.match(/^\*\*Description:\*\*\s*(.+)$/);
        if (match) metadata.description = match[1].trim();
      } else if (line.startsWith("**Type:**")) {
        const match = line.match(/^\*\*Type:\*\*\s*(.+)$/);
        if (match) metadata.type = match[1].trim();
      } else if (line.startsWith("**Status:**")) {
        const match = line.match(/^\*\*Status:\*\*\s*(.+)$/);
        if (match) metadata.status = match[1].trim();
      } else if (line.startsWith("**Priority:**")) {
        const match = line.match(/^\*\*Priority:\*\*\s*(.+)$/);
        if (match) metadata.priority = match[1].trim();
      } else if (line.startsWith("**Created:**")) {
        const match = line.match(/^\*\*Created:\*\*\s*(.+)$/);
        if (match) metadata.created = match[1].trim();
      } else if (line.startsWith("**Updated:**")) {
        const match = line.match(/^\*\*Updated:\*\*\s*(.+)$/);
        if (match) metadata.updated = match[1].trim();
      } else if (line.startsWith("**PRD:**")) {
        // Support both [Link](path) and [Any Text](path) formats
        const match = line.match(/^\*\*PRD:\*\*\s*\[([^\]]*)\]\((.+)\)$/);
        console.log("[TaskParser] PRD line found:", JSON.stringify(line));
        console.log("[TaskParser] PRD regex match:", match);
        if (match) {
          metadata.prd = match[2].trim();
          console.log("[TaskParser] PRD path extracted:", metadata.prd);
        }
      } else if (line.startsWith("**Order:**")) {
        const match = line.match(/^\*\*Order:\*\*\s*(\d+)$/);
        if (match) metadata.order = parseInt(match[1], 10);
      } else if (line.startsWith("**Claimed-By:**")) {
        metadata.claimedBy = line.replace("**Claimed-By:**", "").trim();
      } else if (line.startsWith("**Claimed-At:**")) {
        metadata.claimedAt = line.replace("**Claimed-At:**", "").trim();
      } else if (line.startsWith("**Completed-At:**")) {
        metadata.completedAt = line.replace("**Completed-At:**", "").trim();
      } else if (line.startsWith("**Rejection-Count:**")) {
        const match = line.match(/^\*\*Rejection-Count:\*\*\s*(\d+)$/);
        if (match) metadata.rejectionCount = parseInt(match[1], 10);
      } else if (line.startsWith("**Agent-Notes:**")) {
        const noteLines: string[] = [];
        // First, capture any text on the same line as the key
        const sameLineText = line.replace("**Agent-Notes:**", "").trim();
        if (sameLineText) noteLines.push(sameLineText);
        // Then continue with following lines
        let noteIdx = lines.indexOf(line) + 1;
        while (
          noteIdx < lines.length &&
          !lines[noteIdx].startsWith("**") &&
          !lines[noteIdx].startsWith("---")
        ) {
          if (lines[noteIdx].trim()) noteLines.push(lines[noteIdx].trim());
          noteIdx++;
        }
        metadata.agentNotes = noteLines.join("\n");
      } else if (line.startsWith("**Assigned-Agent:**")) {
        const match = line.match(/^\*\*Assigned-Agent:\*\*\s*(.+)$/);
        if (match) metadata.assignedAgent = match[1].trim();
      }
      // Worktree metadata
      else if (line.startsWith("**Worktree-Enabled:**")) {
        const match = line.match(/^\*\*Worktree-Enabled:\*\*\s*(.+)$/);
        if (match) metadata.worktreeEnabled = match[1].trim().toLowerCase() === "true";
      } else if (line.startsWith("**Worktree-Path:**")) {
        const match = line.match(/^\*\*Worktree-Path:\*\*\s*(.+)$/);
        if (match) metadata.worktreePath = match[1].trim();
      } else if (line.startsWith("**Worktree-Branch:**")) {
        const match = line.match(/^\*\*Worktree-Branch:\*\*\s*(.+)$/);
        if (match) metadata.worktreeBranch = match[1].trim();
      } else if (line.startsWith("**Worktree-Base-Branch:**")) {
        const match = line.match(/^\*\*Worktree-Base-Branch:\*\*\s*(.+)$/);
        if (match) metadata.worktreeBaseBranch = match[1].trim();
      } else if (line.startsWith("**Worktree-Created-At:**")) {
        const match = line.match(/^\*\*Worktree-Created-At:\*\*\s*(.+)$/);
        if (match) metadata.worktreeCreatedAt = match[1].trim();
      } else if (line.startsWith("**Worktree-Status:**")) {
        const match = line.match(/^\*\*Worktree-Status:\*\*\s*(.+)$/);
        if (match) metadata.worktreeStatus = match[1].trim();
      }
      // GitHub metadata
      else if (line.startsWith("**GitHub:**")) {
        const match = line.match(/^\*\*GitHub:\*\*\s*\[.*\]\((.+)\)$/);
        if (match) {
          metadata.githubIssueUrl = match[1].trim();
          // Parse issue number from URL
          const numMatch = match[1].match(/\/issues\/(\d+)/);
          if (numMatch) metadata.githubIssueNumber = parseInt(numMatch[1], 10);
          // Parse repository from URL
          const repoMatch = match[1].match(/github\.com\/([^/]+\/[^/]+)\//);
          if (repoMatch) metadata.githubRepository = repoMatch[1];
        }
      } else if (line.startsWith("**GitHub-PR:**")) {
        const match = line.match(/^\*\*GitHub-PR:\*\*\s*\[.*\]\((.+)\)$/);
        if (match) {
          metadata.githubPrUrl = match[1].trim();
          const numMatch = match[1].match(/\/pull\/(\d+)/);
          if (numMatch) metadata.githubPrNumber = parseInt(numMatch[1], 10);
        }
      } else if (line.startsWith("**GitHub-Synced:**")) {
        const match = line.match(/^\*\*GitHub-Synced:\*\*\s*(.+)$/);
        if (match) metadata.githubLastSynced = match[1].trim();
      } else if (line.startsWith("---") && inMetadataSection) {
        break;
      }
    }

    const completed = metadata.status === "Done";

    // Build worktree metadata if present
    let worktree: TaskWorktreeMetadata | undefined;
    if (metadata.worktreeEnabled !== undefined) {
      worktree = {
        worktreeEnabled: Boolean(metadata.worktreeEnabled),
        worktreePath: metadata.worktreePath as string | undefined,
        worktreeBranch: metadata.worktreeBranch as string | undefined,
        worktreeBaseBranch: metadata.worktreeBaseBranch as string | undefined,
        worktreeCreatedAt: metadata.worktreeCreatedAt as string | undefined,
        worktreeStatus: metadata.worktreeStatus as WorktreeStatus | undefined,
      };
    }

    // Build GitHub metadata if present
    let github: GitHubMetadata | undefined;
    if (metadata.githubIssueUrl || metadata.githubPrUrl) {
      github = {
        issueUrl: metadata.githubIssueUrl as string | undefined,
        issueNumber: metadata.githubIssueNumber as number | undefined,
        repository: metadata.githubRepository as string | undefined,
        prUrl: metadata.githubPrUrl as string | undefined,
        prNumber: metadata.githubPrNumber as number | undefined,
        lastSynced: metadata.githubLastSynced as string | undefined,
      };
    }

    return {
      id: String(metadata.id || ""),
      label: String(metadata.label || label),
      description: String(metadata.description || ""),
      type: String(metadata.type || "Task"),
      status: (metadata.status as Task["status"]) || "Backlog",
      priority: (metadata.priority as Task["priority"]) || "Medium",
      created: String(metadata.created || ""),
      updated: String(metadata.updated || ""),
      prdPath: String(metadata.prd || ""),
      filePath,
      completed,
      project: projectName,
      order: metadata.order !== undefined ? (metadata.order as number) : undefined,
      claimedBy: String(metadata.claimedBy || ""),
      claimedAt: String(metadata.claimedAt || ""),
      completedAt: String(metadata.completedAt || ""),
      rejectionCount: (metadata.rejectionCount as number) || 0,
      agentNotes: String(metadata.agentNotes || ""),
      assignedAgent: metadata.assignedAgent as Task["assignedAgent"],
      worktree,
      github,
    };
  }

  /**
   * Recursively scan directory for .md files
   */
  private scanDirectoryRecursive(
    dir: string,
    projectName: string,
    taskFiles: Array<{ path: string; project: string }>
  ): void {
    if (!fs.existsSync(dir)) {
      return;
    }

    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        this.scanDirectoryRecursive(fullPath, projectName, taskFiles);
      } else if (item.isFile() && item.name.endsWith(".md") && item.name !== "README.md") {
        taskFiles.push({
          path: fullPath,
          project: projectName,
        });
      }
    }
  }

  /**
   * Find all .agent/TASKS/*.md files in workspace folders
   */
  private findTaskFiles(): Array<{ path: string; project: string }> {
    const taskFiles: Array<{ path: string; project: string }> = [];

    for (const folder of this.workspaceDirs) {
      const tasksDir = path.join(folder.path, ".agent", "TASKS");

      if (!fs.existsSync(tasksDir)) {
        continue;
      }

      this.scanDirectoryRecursive(tasksDir, folder.name, taskFiles);
    }

    return taskFiles;
  }

  /**
   * Parse all task files and return structured task data
   */
  public parseTasks(): Task[] {
    const taskFiles = this.findTaskFiles();
    const tasks: Task[] = [];

    for (const { path: filePath, project } of taskFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const task = this.parseStructuredTask(content, filePath, project);
        if (task) {
          tasks.push(task);
        }
      } catch (error) {
        console.error(`Error parsing task file ${filePath}:`, error);
      }
    }

    return tasks;
  }

  /**
   * Group tasks by status
   */
  public groupByStatus(tasks: Task[]): Record<string, Task[]> {
    const grouped: Record<string, Task[]> = {
      Backlog: [],
      Planning: [],
      "In Progress": [],
      "AI Review": [],
      "Human Review": [],
      Done: [],
      Archived: [],
      Blocked: [],
    };

    for (const task of tasks) {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    }

    return grouped;
  }

  /**
   * Update task status by ID
   */
  public updateTaskStatus(taskId: string, newStatus: TaskStatus, order?: number): void {
    const tasks = this.parseTasks();
    const task = tasks.find((t) => t.id === taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");

    const now = new Date().toISOString();
    let orderLineExists = false;
    const updatedLines = lines.map((line) => {
      if (line.startsWith("**Status:**")) {
        return `**Status:** ${newStatus}`;
      } else if (line.startsWith("**Order:**")) {
        orderLineExists = true;
        if (order !== undefined) {
          return `**Order:** ${order}`;
        }
        return line;
      } else if (line.startsWith("**Updated:**")) {
        return `**Updated:** ${now}`;
      }
      return line;
    });

    if (order !== undefined && !orderLineExists) {
      const priorityIndex = updatedLines.findIndex((line) => line.startsWith("**Priority:**"));
      if (priorityIndex >= 0) {
        updatedLines.splice(priorityIndex + 1, 0, `**Order:** ${order}`);
      }
    }

    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");
  }

  /**
   * Update task order by ID
   */
  public updateTaskOrder(taskId: string, order: number): void {
    const tasks = this.parseTasks();
    const task = tasks.find((t) => t.id === taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");

    const now = new Date().toISOString();
    let orderLineExists = false;
    const updatedLines = lines.map((line) => {
      if (line.startsWith("**Order:**")) {
        orderLineExists = true;
        return `**Order:** ${order}`;
      } else if (line.startsWith("**Updated:**")) {
        return `**Updated:** ${now}`;
      }
      return line;
    });

    if (!orderLineExists) {
      const priorityIndex = updatedLines.findIndex((line) => line.startsWith("**Priority:**"));
      if (priorityIndex >= 0) {
        updatedLines.splice(priorityIndex + 1, 0, `**Order:** ${order}`);
      }
    }

    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");
  }

  /**
   * Get a single task by ID
   */
  public getTask(taskId: string): Task | undefined {
    const tasks = this.parseTasks();
    return tasks.find((t) => t.id === taskId);
  }
}
