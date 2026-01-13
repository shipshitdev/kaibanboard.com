import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export interface Task {
  id: string;
  label: string;
  description: string;
  type: string;
  status: "Backlog" | "To Do" | "Doing" | "Testing" | "Done" | "Blocked";
  priority: "High" | "Medium" | "Low";
  created: string;
  updated: string;
  prdPath: string;
  filePath: string;
  completed: boolean;
  project: string;
  order?: number; // Order within the current status column
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
      status: (metadata.status as Task["status"]) || "To Do",
      priority: (metadata.priority as Task["priority"]) || "Medium",
      created: String(metadata.created || ""),
      updated: String(metadata.updated || ""),
      prdPath: String(metadata.prd || ""),
      filePath,
      completed,
      project: projectName,
      order: metadata.order !== undefined ? (metadata.order as number) : undefined,
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
      Doing: [],
      Testing: [],
      Done: [],
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
   * Write task file in structured format
   */
  public writeTask(task: Task): void {
    const orderLine = task.order !== undefined ? `**Order:** ${task.order}\n` : "";
    const content = `## Task: ${task.label}

**ID:** ${task.id}
**Label:** ${task.label}
**Description:** ${task.description}
**Type:** ${task.type}
**Status:** ${task.status}
**Priority:** ${task.priority}
${orderLine}**Created:** ${task.created}
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
    newStatus: "Backlog" | "To Do" | "Doing" | "Testing" | "Done" | "Blocked",
    order?: number
  ): Promise<void> {
    const tasks = await this.parseTasks();
    const task = tasks.find((t) => t.id === taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    // Read the file content
    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");

    // Update status, order (if provided), and timestamp
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

    // If order is provided but order line doesn't exist, insert it after Priority
    if (order !== undefined && !orderLineExists) {
      const priorityIndex = updatedLines.findIndex((line) => line.startsWith("**Priority:**"));
      if (priorityIndex >= 0) {
        updatedLines.splice(priorityIndex + 1, 0, `**Order:** ${order}`);
      }
    }

    // Write back to file
    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");

    // Also update PRD file status if it exists
    if (task.prdPath) {
      await this.updatePRDStatus(task.filePath, task.prdPath, newStatus);
    }
  }

  /**
   * Update task order by ID
   */
  public async updateTaskOrder(taskId: string, order: number): Promise<void> {
    const tasks = await this.parseTasks();
    const task = tasks.find((t) => t.id === taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    // Read the file content
    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");

    // Update order and timestamp
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

    // If order line doesn't exist, insert it after Priority
    if (!orderLineExists) {
      const priorityIndex = updatedLines.findIndex((line) => line.startsWith("**Priority:**"));
      if (priorityIndex >= 0) {
        updatedLines.splice(priorityIndex + 1, 0, `**Order:** ${order}`);
      }
    }

    // Write back to file
    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");
  }

  /**
   * Update task fields by ID
   */
  public async updateTask(
    taskId: string,
    updates: {
      label?: string;
      description?: string;
      priority?: string;
      type?: string;
      status?: string;
    }
  ): Promise<void> {
    const tasks = await this.parseTasks();
    const task = tasks.find((t) => t.id === taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");
    const now = new Date().toISOString();

    const updatedLines = lines.map((line, index) => {
      if (index === 0 && updates.label !== undefined) {
        return `## Task: ${updates.label}`;
      } else if (line.startsWith("**Label:**") && updates.label !== undefined) {
        return `**Label:** ${updates.label}`;
      } else if (line.startsWith("**Description:**") && updates.description !== undefined) {
        return `**Description:** ${updates.description}`;
      } else if (line.startsWith("**Type:**") && updates.type !== undefined) {
        return `**Type:** ${updates.type}`;
      } else if (line.startsWith("**Status:**") && updates.status !== undefined) {
        return `**Status:** ${updates.status}`;
      } else if (line.startsWith("**Priority:**") && updates.priority !== undefined) {
        return `**Priority:** ${updates.priority}`;
      } else if (line.startsWith("**Updated:**")) {
        return `**Updated:** ${now}`;
      }
      return line;
    });

    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");

    if (updates.status && task.prdPath) {
      await this.updatePRDStatus(
        task.filePath,
        task.prdPath,
        updates.status as "Backlog" | "To Do" | "Doing" | "Testing" | "Done" | "Blocked"
      );
    }
  }

  /**
   * Update task PRD path by ID
   */
  public async updateTaskPRD(taskId: string, prdPath: string): Promise<void> {
    const tasks = await this.parseTasks();
    const task = tasks.find((t) => t.id === taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    // Read the file content
    const content = fs.readFileSync(task.filePath, "utf-8");
    const lines = content.split("\n");

    // Update PRD and timestamp
    const now = new Date().toISOString();
    let prdLineExists = false;
    const updatedLines = lines.map((line) => {
      if (line.startsWith("**PRD:**")) {
        prdLineExists = true;
        return `**PRD:** [Link](${prdPath})`;
      } else if (line.startsWith("**Updated:**")) {
        return `**Updated:** ${now}`;
      }
      return line;
    });

    // If PRD line doesn't exist, insert it after Updated
    if (!prdLineExists) {
      const updatedIndex = updatedLines.findIndex((line) => line.startsWith("**Updated:**"));
      if (updatedIndex >= 0) {
        updatedLines.splice(updatedIndex + 1, 0, `**PRD:** [Link](${prdPath})`);
      }
    }

    // Write back to file
    fs.writeFileSync(task.filePath, updatedLines.join("\n"), "utf-8");
  }

  /**
   * Update PRD file status to sync with task status
   */
  private async updatePRDStatus(
    taskFilePath: string,
    prdPath: string,
    newStatus: "Backlog" | "To Do" | "Doing" | "Testing" | "Done" | "Blocked"
  ): Promise<void> {
    try {
      // Resolve PRD path relative to task file
      const taskDir = path.dirname(taskFilePath);
      let resolvedPrdPath: string;

      // Handle relative paths
      if (prdPath.startsWith("../") || prdPath.startsWith("./")) {
        resolvedPrdPath = path.resolve(taskDir, prdPath);
      } else if (path.isAbsolute(prdPath)) {
        resolvedPrdPath = prdPath;
      } else {
        // Try resolving from workspace root
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const config = vscode.workspace.getConfiguration("kaiban.prd");
          const basePath = config.get<string>("basePath", ".agent/PRDS");
          resolvedPrdPath = path.resolve(workspaceFolders[0].uri.fsPath, basePath, prdPath);
        } else {
          resolvedPrdPath = path.resolve(taskDir, prdPath);
        }
      }

      // Check if PRD file exists
      if (!fs.existsSync(resolvedPrdPath)) {
        // PRD file doesn't exist, skip silently
        return;
      }

      // Read PRD file content
      const prdContent = fs.readFileSync(resolvedPrdPath, "utf-8");
      const prdLines = prdContent.split("\n");

      // Check if PRD has a status field
      const hasStatusField = prdLines.some((line) => line.match(/^\*\*Status:\*\*/i));

      if (hasStatusField) {
        // Update existing status field
        const updatedPrdLines = prdLines.map((line) => {
          if (line.match(/^\*\*Status:\*\*/i)) {
            return `**Status:** ${newStatus}`;
          }
          return line;
        });
        fs.writeFileSync(resolvedPrdPath, updatedPrdLines.join("\n"), "utf-8");
      } else {
        // PRD doesn't have status field - optionally add it after the title
        // Find the first heading or add after first line
        let insertIndex = 1;
        for (let i = 0; i < prdLines.length; i++) {
          if (prdLines[i].startsWith("#")) {
            insertIndex = i + 1;
            break;
          }
        }

        // Insert status field after title
        const updatedPrdLines = [
          ...prdLines.slice(0, insertIndex),
          "",
          `**Status:** ${newStatus}`,
          ...prdLines.slice(insertIndex),
        ];
        fs.writeFileSync(resolvedPrdPath, updatedPrdLines.join("\n"), "utf-8");
      }
    } catch (error) {
      // Silently fail if PRD update fails (PRD might not exist or be accessible)
      // Log for debugging but don't throw
      console.warn(`Failed to update PRD status: ${error}`);
    }
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
