/**
 * AI Provider Types
 * Unified interfaces for multi-provider AI agent integration
 */

export type ProviderType = "cursor" | "openai" | "openrouter" | "replicate";

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  enabled: boolean;
  model?: string;
}

export interface TaskPrompt {
  title: string;
  description: string;
  type: string;
  priority: string;
  prdContent?: string;
  rejectionHistory?: string;
  filePath: string;
}

export interface AgentResponse {
  id: string;
  status: "pending" | "running" | "completed" | "error";
  provider: ProviderType;
  model?: string;
  output?: string;
  branchName?: string;
  prUrl?: string;
  error?: string;
  tokensUsed?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  inputPrice: number; // per million tokens
  outputPrice: number; // per million tokens
  supportsTools: boolean;
  supportsStreaming: boolean;
}

export interface SendTaskOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  createBranch?: boolean;
  createPR?: boolean;
}

export interface StreamChunk {
  type: "text" | "status" | "error" | "done";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AIProviderAdapter {
  readonly type: ProviderType;
  readonly displayName: string;
  readonly supportsStreaming: boolean;
  readonly supportsAgentMode: boolean;

  /**
   * Validate that an API key is correctly formatted and optionally test it
   */
  validateApiKey(apiKey: string): Promise<boolean>;

  /**
   * Get list of available models for this provider
   */
  getAvailableModels(): Promise<ModelInfo[]>;

  /**
   * Send a task to the AI provider and get a response
   */
  sendTask(prompt: TaskPrompt, options: SendTaskOptions): Promise<AgentResponse>;

  /**
   * Stream task response (optional - only for providers that support streaming)
   */
  streamTask?(prompt: TaskPrompt, options: SendTaskOptions): AsyncIterable<StreamChunk>;

  /**
   * Check status of a running agent/prediction (optional - for async providers)
   */
  checkStatus?(agentId: string): Promise<AgentResponse>;

  /**
   * Cancel a running agent/prediction (optional)
   */
  cancelTask?(agentId: string): Promise<void>;
}

/**
 * Base class for AI provider adapters with common functionality
 */
export abstract class BaseProviderAdapter implements AIProviderAdapter {
  abstract readonly type: ProviderType;
  abstract readonly displayName: string;
  abstract readonly supportsStreaming: boolean;
  abstract readonly supportsAgentMode: boolean;

  constructor(protected readonly getApiKey: () => Promise<string | undefined>) {}

  abstract validateApiKey(apiKey: string): Promise<boolean>;
  abstract getAvailableModels(): Promise<ModelInfo[]>;
  abstract sendTask(prompt: TaskPrompt, options: SendTaskOptions): Promise<AgentResponse>;

  /**
   * Compose a prompt string from task data
   */
  protected composePrompt(task: TaskPrompt): string {
    const parts: string[] = [];

    parts.push(`# Task: ${task.title}`);
    parts.push("");
    parts.push(`**Type:** ${task.type}`);
    parts.push(`**Priority:** ${task.priority}`);
    parts.push("");

    if (task.description) {
      parts.push("## Description");
      parts.push(task.description);
      parts.push("");
    }

    if (task.rejectionHistory) {
      parts.push("## Previous Feedback");
      parts.push("This task has been rejected previously. Please address the following feedback:");
      parts.push(task.rejectionHistory);
      parts.push("");
    }

    if (task.prdContent) {
      parts.push("## Product Requirements Document");
      parts.push(task.prdContent);
      parts.push("");
    }

    if (task.filePath) {
      parts.push("## Task File");
      parts.push(`Task is defined in: ${task.filePath}`);
      parts.push("");
    }

    parts.push("## Instructions");
    parts.push("1. Implement the task as described above");
    parts.push("2. Follow existing code patterns and conventions");
    parts.push("3. Add appropriate tests if applicable");
    parts.push("4. Update documentation if needed");
    parts.push("5. Create a clear commit message describing the changes");

    return parts.join("\n");
  }

  /**
   * Get the system prompt for code generation
   */
  protected getSystemPrompt(): string {
    return `You are an expert software engineer. You help implement tasks by generating high-quality, production-ready code.

Guidelines:
- Write clean, maintainable code following best practices
- Include appropriate error handling
- Add comments only where the code isn't self-explanatory
- Follow the existing code style and patterns in the project
- Consider edge cases and potential issues
- If tests are needed, write comprehensive test cases

When responding, provide:
1. A brief explanation of your approach
2. The code implementation
3. Any important notes or considerations`;
  }
}
