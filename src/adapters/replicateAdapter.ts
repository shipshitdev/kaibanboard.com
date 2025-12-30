/**
 * Replicate Adapter
 * Access to 10,000+ open-source models
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

export class ReplicateAdapter implements AIProviderAdapter {
  readonly type: ProviderType = "replicate";
  readonly displayName = "Replicate";
  readonly supportsStreaming = true;
  readonly supportsAgentMode = false;

  private static readonly API_BASE_URL = "https://api.replicate.com/v1";

  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  async validateApiKey(apiKey: string): Promise<boolean> {
    if (!apiKey || !apiKey.startsWith("r8_")) {
      return false;
    }

    try {
      const response = await fetch(`${ReplicateAdapter.API_BASE_URL}/predictions`, {
        method: "GET",
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
        id: "meta/meta-llama-3.1-405b-instruct",
        name: "Llama 3.1 405B Instruct",
        provider: "meta",
        contextWindow: 131072,
        inputPrice: 0.95,
        outputPrice: 0.95,
        supportsTools: false,
        supportsStreaming: true,
      },
      {
        id: "meta/meta-llama-3.1-70b-instruct",
        name: "Llama 3.1 70B Instruct",
        provider: "meta",
        contextWindow: 131072,
        inputPrice: 0.65,
        outputPrice: 2.75,
        supportsTools: false,
        supportsStreaming: true,
      },
      {
        id: "meta/meta-llama-3.1-8b-instruct",
        name: "Llama 3.1 8B Instruct",
        provider: "meta",
        contextWindow: 131072,
        inputPrice: 0.05,
        outputPrice: 0.1,
        supportsTools: false,
        supportsStreaming: true,
      },
      {
        id: "mistralai/mixtral-8x7b-instruct-v0.1",
        name: "Mixtral 8x7B Instruct",
        provider: "mistralai",
        contextWindow: 32768,
        inputPrice: 0.3,
        outputPrice: 1,
        supportsTools: false,
        supportsStreaming: true,
      },
      {
        id: "deepseek-ai/deepseek-v3",
        name: "DeepSeek V3",
        provider: "deepseek",
        contextWindow: 128000,
        inputPrice: 1.45,
        outputPrice: 1.45,
        supportsTools: false,
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
        error: "Replicate API token not configured",
      };
    }

    const model = options.model || "meta/meta-llama-3.1-70b-instruct";
    const composedPrompt = this.composePrompt(prompt);

    try {
      // Create prediction
      const response = await fetch(`${ReplicateAdapter.API_BASE_URL}/predictions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: {
            prompt: composedPrompt,
            system_prompt: this.getSystemPrompt(),
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature ?? 0.7,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          id: "",
          status: "error",
          provider: this.type,
          model,
          error: `Replicate API error (${response.status}): ${errorText}`,
        };
      }

      const data = (await response.json()) as {
        id: string;
        status: string;
        output?: string[];
        error?: string;
      };

      // If prediction is not yet complete, return running status
      if (data.status !== "succeeded" && data.status !== "failed") {
        return {
          id: data.id,
          status: "running",
          provider: this.type,
          model,
        };
      }

      if (data.status === "failed") {
        return {
          id: data.id,
          status: "error",
          provider: this.type,
          model,
          error: data.error || "Prediction failed",
        };
      }

      return {
        id: data.id,
        status: "completed",
        provider: this.type,
        model,
        output: Array.isArray(data.output) ? data.output.join("") : String(data.output || ""),
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

  async checkStatus(predictionId: string): Promise<AgentResponse> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return {
        id: predictionId,
        status: "error",
        provider: this.type,
        error: "Replicate API token not configured",
      };
    }

    try {
      const response = await fetch(`${ReplicateAdapter.API_BASE_URL}/predictions/${predictionId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          id: predictionId,
          status: "error",
          provider: this.type,
          error: `Replicate API error (${response.status}): ${errorText}`,
        };
      }

      const data = (await response.json()) as {
        id: string;
        status: string;
        output?: string[];
        error?: string;
        metrics?: { predict_time: number };
      };

      return {
        id: data.id,
        status: this.mapStatus(data.status),
        provider: this.type,
        output: Array.isArray(data.output) ? data.output.join("") : String(data.output || ""),
        error: data.error,
      };
    } catch (error) {
      return {
        id: predictionId,
        status: "error",
        provider: this.type,
        error: `Status check failed: ${error}`,
      };
    }
  }

  async cancelTask(predictionId: string): Promise<void> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error("Replicate API token not configured");
    }

    const response = await fetch(
      `${ReplicateAdapter.API_BASE_URL}/predictions/${predictionId}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to cancel prediction: ${errorText}`);
    }
  }

  async *streamTask(prompt: TaskPrompt, options: SendTaskOptions): AsyncIterable<StreamChunk> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      yield { type: "error", content: "Replicate API token not configured" };
      return;
    }

    const model = options.model || "meta/meta-llama-3.1-70b-instruct";
    const composedPrompt = this.composePrompt(prompt);

    try {
      // Create prediction with streaming
      const response = await fetch(`${ReplicateAdapter.API_BASE_URL}/predictions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: {
            prompt: composedPrompt,
            system_prompt: this.getSystemPrompt(),
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature ?? 0.7,
          },
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        yield { type: "error", content: `Replicate API error (${response.status}): ${errorText}` };
        return;
      }

      const data = (await response.json()) as {
        id: string;
        urls?: { stream?: string };
      };

      if (!data.urls?.stream) {
        // Fall back to polling if no stream URL
        yield { type: "status", content: "Streaming not available, polling for result..." };
        const result = await this.pollForCompletion(data.id);
        if (result.status === "error") {
          yield { type: "error", content: result.error || "Unknown error" };
        } else {
          yield { type: "text", content: result.output || "" };
          yield { type: "done", content: "" };
        }
        return;
      }

      // Connect to stream URL
      const streamResponse = await fetch(data.urls.stream, {
        headers: {
          Accept: "text/event-stream",
        },
      });

      if (!streamResponse.ok) {
        yield { type: "error", content: `Stream connection failed: ${streamResponse.status}` };
        return;
      }

      const reader = streamResponse.body?.getReader();
      if (!reader) {
        yield { type: "error", content: "No stream body" };
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
          if (line.startsWith("event: ")) {
            const event = line.slice(7);
            if (event === "done") {
              yield { type: "done", content: "" };
              return;
            }
            if (event === "error") {
              yield { type: "error", content: "Stream error" };
              return;
            }
          } else if (line.startsWith("data: ")) {
            const content = line.slice(6);
            if (content) {
              yield { type: "text", content };
            }
          }
        }
      }

      yield { type: "done", content: "" };
    } catch (error) {
      yield { type: "error", content: `Stream failed: ${error}` };
    }
  }

  private async pollForCompletion(predictionId: string, maxAttempts = 60): Promise<AgentResponse> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.checkStatus(predictionId);
      if (status.status === "completed" || status.status === "error") {
        return status;
      }
      // Wait 2 seconds between polls
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return {
      id: predictionId,
      status: "error",
      provider: this.type,
      error: "Prediction timed out after polling",
    };
  }

  private mapStatus(replicateStatus: string): AgentResponse["status"] {
    switch (replicateStatus) {
      case "starting":
      case "processing":
        return "running";
      case "succeeded":
        return "completed";
      case "failed":
      case "canceled":
        return "error";
      default:
        return "pending";
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
