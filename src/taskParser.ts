import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export interface Task {
  id: string;
  label: string;
  description: string;
  type: string;
  status: "Backlog" | "To Do" | "Testing" | "Done";
  priority: "High" | "Medium" | "Low";
  created: string;
  updated: string;
  prdPath: string;
  filePath: string;
  completed: boolean;
  project: string;
  // Agent metadata for AI loop
  claimedBy: string;
  claimedAt: string;
  completedAt: string;
  rejectionCount: number;
  agentNotes: string;
}

export class TaskParser {
  /**
   * Parse a structured task file
   * Format: ## Task: Title with metadata sections
   */
  private parseStructuredTask(content: string, filePath: string, projectName: string): Task | null {
    const lines = content.split("\n");

    // Extract task title from first line
    const titleMatch = lines[0].match(/^## Task:\s*(.+)$/);
    if (!titleMatch) {
      return null;
    }

    const label = titleMatch[1].trim();

    // Parse metadata fields
    const metadata: Record<string, string | number> = {};
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
        const match = line.match(/^\*\*PRD:\*\*\s*\[Link\]\((.+)\)$/);
        if (match) metadata.prd = match[1].trim();
      } else if (line.startsWith("**Claimed-By:**")) {
        const match = line.match(/^\*\*Claimed-By:\*\*\s*(.*)$/);
        if (match) metadata.claimedBy = match[1].trim();
      } else if (line.startsWith("**Claimed-At:**")) {
        const match = line.match(/^\*\*Claimed-At:\*\*\s*(.*)$/);
        if (match) metadata.claimedAt = match[1].trim();
      } else if (line.startsWith("**Completed-At:**")) {
        const match = line.match(/^\*\*Completed-At:\*\*\s*(.*)$/);
        if (match) metadata.completedAt = match[1].trim();
      } else if (line.startsWith("**Rejection-Count:**")) {
        const match = line.match(/^\*\*Rejection-Count:\*\*\s*(\d+)$/);
        if (match) metadata.rejectionCount = parseInt(match[1], 10);
      } else if (line.startsWith("**Agent-Notes:**")) {
        // Capture multi-line agent notes (until next section)
        const noteLines: string[] = [];
        let noteIdx = lines.indexOf(line) + 1;
        while (
          noteIdx < lines.length &&
          !lines[noteIdx].startsWith("**") &&
          !lines[noteIdx].startsWith("---")
        ) {
          if (lines[noteIdx].trim()) noteLines.push(lines[noteIdx]);
          noteIdx++;
        }
        metadata.agentNotes = noteLines.join("\n");
      } else if (line.startsWith("---") && inMetadataSection) {
        break;
      }
    }

    // Determine if task is completed
    const completed = metadata.status === "Done";

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
      // Agent metadata
      claimedBy: String(metadata.claimedBy || ""),
      claimedAt: String(metadata.claimedAt || ""),
      completedAt: String(metadata.completedAt || ""),
      rejectionCount: (metadata.rejectionCount as number) || 0,
      agentNotes: String(metadata.agentNotes || ""),
    };
  }

  /**
   * Find all .agent/TASKS/*.md files in workspace folders (recursively)
   */
  private async findTaskFiles(): Promise<Array<{ path: string; project: string }>> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return [];
    }

    const taskFiles: Array<{ path: string; project: string }> = [];

    for (const folder of workspaceFolders) {
      const tasksDir = path.join(folder.uri.fsPath, ".agent", "TASKS");

      if (!fs.existsSync(tasksDir)) {
        continue;
      }

      // Recursively scan for .md files
      this.scanDirectoryRecursive(tasksDir, folder.name, taskFiles);
    }

    return taskFiles;
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
        // Recursively scan subdirectories
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
   * Parse all task files and return structured task data
   */
  public async parseTasks(): Promise<Task[]> {
    const taskFiles = await this.findTaskFiles();
    const tasks: Task[] = [];

    for (const { path: filePath, project } of taskFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");

        // Try new structured format first
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
      "To Do": [],
      Testing: [],
      Done: [],
    };

    for (const task of tasks) {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    }

    return grouped;
  }

  /**
   * Write task file in structured format
   */
  public writeTask(task: Task): void {
    const content = `## Task: ${task.label}

**ID:** ${task.id}
**Label:** ${task.label}
**Description:** ${task.description}
**Type:** ${task.type}
**Status:** ${task.status}
**Priority:** ${task.priority}
**Created:** ${task.created}
**Updated:** ${task.updated}
**PRD:** [Link](${task.prdPath})

---
`;

    fs.writeFileSync(task.filePath, content, "utf-8");
  }

  /**
   * Update task status by ID
   */
  public async updateTaskStatus(
    taskId: string,
    newStatus: "Backlog" | "To Do" | "Testing" | "Done"
  ): Promise<void> {
    const tasks = await this.parseTasks();
    const task = tasks.find((t) => t.id === taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    // Read the file content
    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");

    // Update status and timestamp
    const now = new Date().toISOString();
    const updatedLines = lines.map((line) => {
      if (line.startsWith("**Status:**")) {
        return `**Status:** ${newStatus}`;
      } else if (line.startsWith("**Updated:**")) {
        return `**Updated:** ${now}`;
      }
      return line;
    });

    // Write back to file
    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");
  }

  /**
   * Reject a task - move back to To Do with rejection note
   */
  public async rejectTask(taskId: string, note: string): Promise<void> {
    const tasks = await this.parseTasks();
    const task = tasks.find((t) => t.id === taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    // Read the file content
    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");

    // Update status, timestamp, rejection count, and add rejection note
    const now = new Date().toISOString();
    const newRejectionCount = task.rejectionCount + 1;
    let rejectionAdded = false;

    const updatedLines = lines.map((line, _idx) => {
      if (line.startsWith("**Status:**")) {
        return "**Status:** To Do";
      } else if (line.startsWith("**Updated:**")) {
        return `**Updated:** ${now}`;
      } else if (line.startsWith("**Claimed-By:**")) {
        return "**Claimed-By:**";
      } else if (line.startsWith("**Claimed-At:**")) {
        return "**Claimed-At:**";
      } else if (line.startsWith("**Completed-At:**")) {
        return "**Completed-At:**";
      } else if (line.startsWith("**Rejection-Count:**")) {
        return `**Rejection-Count:** ${newRejectionCount}`;
      } else if (line.startsWith("**Rejections:**") && !rejectionAdded) {
        rejectionAdded = true;
        return `**Rejections:**\n- ${now.split("T")[0]}: ${note}`;
      }
      return line;
    });

    // Write back to file
    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");
  }
}
