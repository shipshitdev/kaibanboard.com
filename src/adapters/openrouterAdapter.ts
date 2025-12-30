/**
 * OpenRouter Adapter
 * Provides access to 500+ models through a unified API
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

export class OpenRouterAdapter implements AIProviderAdapter {
  readonly type: ProviderType = "openrouter";
  readonly displayName = "OpenRouter";
  readonly supportsStreaming = true;
  readonly supportsAgentMode = false;

  private static readonly API_BASE_URL = "https://openrouter.ai/api/v1";

  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  async validateApiKey(apiKey: string): Promise<boolean> {
    if (!apiKey || !apiKey.startsWith("sk-or-")) {
      return false;
    }

    try {
      const response = await fetch(`${OpenRouterAdapter.API_BASE_URL}/models`, {
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
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return this.getDefaultModels();
    }

    try {
      const response = await fetch(`${OpenRouterAdapter.API_BASE_URL}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        return this.getDefaultModels();
      }

      const data = (await response.json()) as {
        data: Array<{
          id: string;
          name: string;
          context_length: number;
          pricing: { prompt: string; completion: string };
        }>;
      };

      return data.data
        .filter(
          (model) =>
            model.id.includes("gpt") || model.id.includes("claude") || model.id.includes("llama")
        )
        .slice(0, 20)
        .map((model) => ({
          id: model.id,
          name: model.name,
          provider: model.id.split("/")[0],
          contextWindow: model.context_length || 128000,
          inputPrice: Number.parseFloat(model.pricing?.prompt || "0") * 1000000,
          outputPrice: Number.parseFloat(model.pricing?.completion || "0") * 1000000,
          supportsTools: model.id.includes("gpt") || model.id.includes("claude"),
          supportsStreaming: true,
        }));
    } catch {
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): ModelInfo[] {
    return [
      {
        id: "anthropic/claude-3.5-sonnet",
        name: "Claude 3.5 Sonnet",
        provider: "anthropic",
        contextWindow: 200000,
        inputPrice: 3,
        outputPrice: 15,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        contextWindow: 128000,
        inputPrice: 5,
        outputPrice: 15,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "openai",
        contextWindow: 128000,
        inputPrice: 0.15,
        outputPrice: 0.6,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: "meta-llama/llama-3.1-70b-instruct",
        name: "Llama 3.1 70B",
        provider: "meta-llama",
        contextWindow: 131072,
        inputPrice: 0.52,
        outputPrice: 0.75,
        supportsTools: false,
        supportsStreaming: true,
      },
      {
        id: "google/gemini-pro-1.5",
        name: "Gemini Pro 1.5",
        provider: "google",
        contextWindow: 1000000,
        inputPrice: 2.5,
        outputPrice: 7.5,
        supportsTools: true,
        supportsStreaming: true,
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
        error: "OpenRouter API key not configured",
      };
    }

    const model = options.model || "anthropic/claude-3.5-sonnet";
    const composedPrompt = this.composePrompt(prompt);

    try {
      const response = await fetch(`${OpenRouterAdapter.API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/kaiban-md/kaiban-md",
          "X-Title": "Kaiban Markdown",
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
          error: `OpenRouter API error (${response.status}): ${errorText}`,
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
      yield { type: "error", content: "OpenRouter API key not configured" };
      return;
    }

    const model = options.model || "anthropic/claude-3.5-sonnet";
    const composedPrompt = this.composePrompt(prompt);

    try {
      const response = await fetch(`${OpenRouterAdapter.API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/kaiban-md/kaiban-md",
          "X-Title": "Kaiban Markdown",
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
        yield { type: "error", content: `OpenRouter API error (${response.status}): ${errorText}` };
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
