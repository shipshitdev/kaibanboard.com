/**
 * Core types shared between VS Code extension and CLI
 */
export type TaskStatus = "Backlog" | "To Do" | "Doing" | "Testing" | "Done" | "Blocked";
export type TaskPriority = "High" | "Medium" | "Low";
export interface Task {
    id: string;
    label: string;
    description: string;
    type: string;
    status: TaskStatus;
    priority: TaskPriority;
    created: string;
    updated: string;
    prdPath: string;
    filePath: string;
    completed: boolean;
    project: string;
    order?: number;
    claimedBy: string;
    claimedAt: string;
    completedAt: string;
    rejectionCount: number;
    agentNotes: string;
}
export interface TaskParserConfig {
    prdBasePath?: string;
}
export declare const TASK_STATUSES: TaskStatus[];
export declare const TASK_PRIORITIES: TaskPriority[];
//# sourceMappingURL=types.d.ts.map