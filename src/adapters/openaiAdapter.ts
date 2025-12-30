/**
 * OpenAI Adapter
 * Direct integration with OpenAI's GPT models
 */

import type {
  AgentResponse,
  AIProviderAdapter,
  ModelInfo,
  ProviderType,
  SendTaskOptions,
  StreamChunk,
  TaskPrompt,
} from "../types/aiProvider";

export class OpenAIAdapter implements AIProviderAdapter {
  readonly type: ProviderType = "openai";
  readonly displayName = "OpenAI";
  readonly supportsStreaming = true;
  readonly supportsAgentMode = false;

  private static readonly API_BASE_URL = "https://api.openai.com/v1";

  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  async validateApiKey(apiKey: string): Promise<boolean> {
    if (!apiKey || !apiKey.startsWith("sk-")) {
      return false;
    }

    try {
      const response = await fetch(`${OpenAIAdapter.API_BASE_URL}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    return [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        contextWindow: 128000,
        inputPrice: 5,
        outputPrice: 15,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "openai",
        contextWindow: 128000,
        inputPrice: 0.15,
        outputPrice: 0.6,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo",
        provider: "openai",
        contextWindow: 128000,
        inputPrice: 10,
        outputPrice: 30,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: "o1-preview",
        name: "o1 Preview",
        provider: "openai",
        contextWindow: 128000,
        inputPrice: 15,
        outputPrice: 60,
        supportsTools: false,
        supportsStreaming: false,
      },
      {
        id: "o1-mini",
        name: "o1 Mini",
        provider: "openai",
        contextWindow: 128000,
        inputPrice: 3,
        outputPrice: 12,
        supportsTools: false,
        supportsStreaming: false,
      },
    ];
  }

  async sendTask(prompt: TaskPrompt, options: SendTaskOptions): Promise<AgentResponse> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return {
        id: "",
        status: "error",
        provider: this.type,
        error: "OpenAI API key not configured",
      };
    }

    const model = options.model || "gpt-4o";
    const composedPrompt = this.composePrompt(prompt);

    try {
      const response = await fetch(`${OpenAIAdapter.API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: this.getSystemPrompt() },
            { role: "user", content: composedPrompt },
          ],
          max_tokens: options.maxTokens || 4096,
          temperature: options.temperature ?? 0.7,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          id: "",
          status: "error",
          provider: this.type,
          model,
          error: `OpenAI API error (${response.status}): ${errorText}`,
        };
      }

      const data = (await response.json()) as {
        id: string;
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      return {
        id: data.id,
        status: "completed",
        provider: this.type,
        model,
        output: data.choices[0]?.message?.content || "",
        tokensUsed: data.usage?.total_tokens,
      };
    } catch (error) {
      return {
        id: "",
        status: "error",
        provider: this.type,
        model,
        error: `Request failed: ${error}`,
      };
    }
  }

  async *streamTask(prompt: TaskPrompt, options: SendTaskOptions): AsyncIterable<StreamChunk> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      yield { type: "error", content: "OpenAI API key not configured" };
      return;
    }

    const model = options.model || "gpt-4o";
    const composedPrompt = this.composePrompt(prompt);

    // o1 models don't support streaming
    if (model.startsWith("o1")) {
      yield {
        type: "status",
        content: "o1 models do not support streaming, using non-streaming mode",
      };
      const response = await this.sendTask(prompt, { ...options, stream: false });
      if (response.status === "error") {
        yield { type: "error", content: response.error || "Unknown error" };
      } else {
        yield { type: "text", content: response.output || "" };
        yield { type: "done", content: "" };
      }
      return;
    }

    try {
      const response = await fetch(`${OpenAIAdapter.API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: this.getSystemPrompt() },
            { role: "user", content: composedPrompt },
          ],
          max_tokens: options.maxTokens || 4096,
          temperature: options.temperature ?? 0.7,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        yield { type: "error", content: `OpenAI API error (${response.status}): ${errorText}` };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: "error", content: "No response body" };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              yield { type: "done", content: "" };
              return;
            }

            try {
              const parsed = JSON.parse(data) as {
                choices: Array<{ delta: { content?: string } }>;
              };
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                yield { type: "text", content };
              }
            } catch {
              // Skip invalid JSON chunks
            }
          }
        }
      }

      yield { type: "done", content: "" };
    } catch (error) {
      yield { type: "error", content: `Stream failed: ${error}` };
    }
  }

  private composePrompt(task: TaskPrompt): string {
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

  private getSystemPrompt(): string {
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
