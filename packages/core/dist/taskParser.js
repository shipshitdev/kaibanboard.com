"use strict";
/**
 * Core task parser - VS Code independent
 * Can be used by both the extension and CLI
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoreTaskParser = void 0;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
class CoreTaskParser {
    workspaceDirs;
    config;
    constructor(workspaceDirs, config = {}) {
        this.workspaceDirs = workspaceDirs;
        this.config = config;
    }
    /**
     * Get the PRD base path from config
     */
    getPrdBasePath() {
        return this.config.prdBasePath || ".agent/PRDS";
    }
    /**
     * Parse a structured task file
     * Format: ## Task: Title with metadata sections
     */
    parseStructuredTask(content, filePath, projectName) {
        const lines = content.split("\n");
        const titleMatch = lines[0].match(/^## Task:\s*(.+)$/);
        if (!titleMatch) {
            return null;
        }
        const label = titleMatch[1].trim();
        const metadata = {};
        let inMetadataSection = false;
        for (const line of lines) {
            if (line.startsWith("**ID:**")) {
                inMetadataSection = true;
                const match = line.match(/^\*\*ID:\*\*\s*(.+)$/);
                if (match)
                    metadata.id = match[1].trim();
            }
            else if (line.startsWith("**Label:**")) {
                const match = line.match(/^\*\*Label:\*\*\s*(.+)$/);
                if (match)
                    metadata.label = match[1].trim();
            }
            else if (line.startsWith("**Description:**")) {
                const match = line.match(/^\*\*Description:\*\*\s*(.+)$/);
                if (match)
                    metadata.description = match[1].trim();
            }
            else if (line.startsWith("**Type:**")) {
                const match = line.match(/^\*\*Type:\*\*\s*(.+)$/);
                if (match)
                    metadata.type = match[1].trim();
            }
            else if (line.startsWith("**Status:**")) {
                const match = line.match(/^\*\*Status:\*\*\s*(.+)$/);
                if (match)
                    metadata.status = match[1].trim();
            }
            else if (line.startsWith("**Priority:**")) {
                const match = line.match(/^\*\*Priority:\*\*\s*(.+)$/);
                if (match)
                    metadata.priority = match[1].trim();
            }
            else if (line.startsWith("**Created:**")) {
                const match = line.match(/^\*\*Created:\*\*\s*(.+)$/);
                if (match)
                    metadata.created = match[1].trim();
            }
            else if (line.startsWith("**Updated:**")) {
                const match = line.match(/^\*\*Updated:\*\*\s*(.+)$/);
                if (match)
                    metadata.updated = match[1].trim();
            }
            else if (line.startsWith("**PRD:**")) {
                const match = line.match(/^\*\*PRD:\*\*\s*\[Link\]\((.+)\)$/);
                if (match)
                    metadata.prd = match[1].trim();
            }
            else if (line.startsWith("**Order:**")) {
                const match = line.match(/^\*\*Order:\*\*\s*(\d+)$/);
                if (match)
                    metadata.order = parseInt(match[1], 10);
            }
            else if (line.startsWith("**Claimed-By:**")) {
                metadata.claimedBy = line.replace("**Claimed-By:**", "").trim();
            }
            else if (line.startsWith("**Claimed-At:**")) {
                metadata.claimedAt = line.replace("**Claimed-At:**", "").trim();
            }
            else if (line.startsWith("**Completed-At:**")) {
                metadata.completedAt = line.replace("**Completed-At:**", "").trim();
            }
            else if (line.startsWith("**Rejection-Count:**")) {
                const match = line.match(/^\*\*Rejection-Count:\*\*\s*(\d+)$/);
                if (match)
                    metadata.rejectionCount = parseInt(match[1], 10);
            }
            else if (line.startsWith("**Agent-Notes:**")) {
                const noteLines = [];
                let noteIdx = lines.indexOf(line) + 1;
                while (noteIdx < lines.length &&
                    !lines[noteIdx].startsWith("**") &&
                    !lines[noteIdx].startsWith("---")) {
                    if (lines[noteIdx].trim())
                        noteLines.push(lines[noteIdx]);
                    noteIdx++;
                }
                metadata.agentNotes = noteLines.join("\n");
            }
            else if (line.startsWith("---") && inMetadataSection) {
                break;
            }
        }
        const completed = metadata.status === "Done";
        return {
            id: String(metadata.id || ""),
            label: String(metadata.label || label),
            description: String(metadata.description || ""),
            type: String(metadata.type || "Task"),
            status: metadata.status || "To Do",
            priority: metadata.priority || "Medium",
            created: String(metadata.created || ""),
            updated: String(metadata.updated || ""),
            prdPath: String(metadata.prd || ""),
            filePath,
            completed,
            project: projectName,
            order: metadata.order !== undefined ? metadata.order : undefined,
            claimedBy: String(metadata.claimedBy || ""),
            claimedAt: String(metadata.claimedAt || ""),
            completedAt: String(metadata.completedAt || ""),
            rejectionCount: metadata.rejectionCount || 0,
            agentNotes: String(metadata.agentNotes || ""),
        };
    }
    /**
     * Recursively scan directory for .md files
     */
    scanDirectoryRecursive(dir, projectName, taskFiles) {
        if (!fs.existsSync(dir)) {
            return;
        }
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
                this.scanDirectoryRecursive(fullPath, projectName, taskFiles);
            }
            else if (item.isFile() && item.name.endsWith(".md") && item.name !== "README.md") {
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
    findTaskFiles() {
        const taskFiles = [];
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
    parseTasks() {
        const taskFiles = this.findTaskFiles();
        const tasks = [];
        for (const { path: filePath, project } of taskFiles) {
            try {
                const content = fs.readFileSync(filePath, "utf-8");
                const task = this.parseStructuredTask(content, filePath, project);
                if (task) {
                    tasks.push(task);
                }
            }
            catch (error) {
                console.error(`Error parsing task file ${filePath}:`, error);
            }
        }
        return tasks;
    }
    /**
     * Group tasks by status
     */
    groupByStatus(tasks) {
        const grouped = {
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
     * Update task status by ID
     */
    updateTaskStatus(taskId, newStatus, order) {
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
            }
            else if (line.startsWith("**Order:**")) {
                orderLineExists = true;
                if (order !== undefined) {
                    return `**Order:** ${order}`;
                }
                return line;
            }
            else if (line.startsWith("**Updated:**")) {
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
    updateTaskOrder(taskId, order) {
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
            }
            else if (line.startsWith("**Updated:**")) {
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
    getTask(taskId) {
        const tasks = this.parseTasks();
        return tasks.find((t) => t.id === taskId);
    }
}
exports.CoreTaskParser = CoreTaskParser;
//# sourceMappingURL=taskParser.js.map