/**
 * Type definitions for Claude CLI JSONL transcript files
 * Location: ~/.claude/projects/[project-hash]/[session-uuid].jsonl
 */

/** Token usage information */
export interface ClaudeUsageInfo {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Text content block */
export interface TextContent {
  type: "text";
  text: string;
}

/** Tool use content block */
export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Tool result content block */
export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string | unknown[];
  is_error?: boolean;
}

export type MessageContent = TextContent | ToolUseContent | ToolResultContent;

/** Claude message structure */
export interface ClaudeMessage {
  role: "user" | "assistant";
  model?: string;
  id?: string;
  content: string | MessageContent[];
  stop_reason?: string | null;
  usage?: ClaudeUsageInfo;
}

/** Tool use result metadata */
export interface ToolUseResultMeta {
  tool_use_id: string;
  success?: boolean;
}

/** Raw JSONL entry from Claude CLI transcript */
export interface ClaudeTranscriptEntry {
  parentUuid: string | null;
  isSidechain?: boolean;
  userType?: string;
  cwd: string;
  sessionId: string;
  version: string;
  gitBranch?: string;
  agentId?: string;
  slug?: string;
  type: "user" | "assistant";
  message: ClaudeMessage;
  uuid: string;
  timestamp: string;
  requestId?: string;
  toolUseResult?: ToolUseResultMeta;
}

/** Processed step info for UI display */
export interface ClaudeStepInfo {
  id: string;
  type: "thinking" | "tool_use" | "tool_result";
  timestamp: Date;
  /** For thinking steps */
  text?: string;
  /** For tool_use steps */
  toolName?: string;
  toolInput?: Record<string, unknown>;
  /** For tool_result steps */
  success?: boolean;
  resultSummary?: string;
}

/** Progress status for a running task */
export type ClaudeProgressStatus =
  | "idle"
  | "thinking"
  | "tool_use"
  | "waiting_result"
  | "completed"
  | "error";

/** Progress state for a running task */
export interface ClaudeStepProgress {
  sessionId: string;
  taskId: string;
  currentStep: ClaudeStepInfo | null;
  recentSteps: ClaudeStepInfo[];
  status: ClaudeProgressStatus;
  lastUpdated: Date;
}

/** Tool name to display name mapping */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  Read: "Reading file",
  Write: "Writing file",
  Edit: "Editing file",
  Glob: "Finding files",
  Grep: "Searching",
  Bash: "Running command",
  Task: "Running agent",
  WebFetch: "Fetching web page",
  WebSearch: "Searching web",
  TodoWrite: "Updating tasks",
  AskUserQuestion: "Asking question",
  NotebookEdit: "Editing notebook",
};

/**
 * Get display text for a tool name
 */
export function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAMES[toolName] || toolName;
}

/**
 * Extract a brief description from tool input
 */
export function getToolInputSummary(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "Read":
      return truncatePath(input.file_path as string);
    case "Write":
      return truncatePath(input.file_path as string);
    case "Edit":
      return truncatePath(input.file_path as string);
    case "Glob":
      return input.pattern as string;
    case "Grep":
      return input.pattern as string;
    case "Bash":
      return truncateString(input.command as string, 40);
    case "Task":
      return (input.description as string) || "subagent";
    case "WebFetch":
      return truncateUrl(input.url as string);
    case "WebSearch":
      return input.query as string;
    default:
      return "";
  }
}

function truncatePath(path: string | undefined): string {
  if (!path) return "";
  const parts = path.split("/");
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : path;
}

function truncateUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return truncateString(url, 30);
  }
}

function truncateString(str: string | undefined, maxLen: number): string {
  if (!str) return "";
  return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
}
