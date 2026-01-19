/**
 * Core task parser - VS Code independent
 * Can be used by both the extension and CLI
 */
import type { Task, TaskParserConfig, TaskStatus } from "./types";
export declare class CoreTaskParser {
    private workspaceDirs;
    protected config: TaskParserConfig;
    constructor(workspaceDirs: Array<{
        path: string;
        name: string;
    }>, config?: TaskParserConfig);
    /**
     * Get the PRD base path from config
     */
    protected getPrdBasePath(): string;
    /**
     * Parse a structured task file
     * Format: ## Task: Title with metadata sections
     */
    private parseStructuredTask;
    /**
     * Recursively scan directory for .md files
     */
    private scanDirectoryRecursive;
    /**
     * Find all .agent/TASKS/*.md files in workspace folders
     */
    private findTaskFiles;
    /**
     * Parse all task files and return structured task data
     */
    parseTasks(): Task[];
    /**
     * Group tasks by status
     */
    groupByStatus(tasks: Task[]): Record<string, Task[]>;
    /**
     * Update task status by ID
     */
    updateTaskStatus(taskId: string, newStatus: TaskStatus, order?: number): void;
    /**
     * Update task order by ID
     */
    updateTaskOrder(taskId: string, order: number): void;
    /**
     * Get a single task by ID
     */
    getTask(taskId: string): Task | undefined;
}
//# sourceMappingURL=taskParser.d.ts.map