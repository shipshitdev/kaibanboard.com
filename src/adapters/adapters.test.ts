import { exec } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { StreamChunk, TaskPrompt } from "../types/aiProvider";
import { CursorCloudAdapter } from "./cursorCloudAdapter";
import { OpenAIAdapter } from "./openaiAdapter";
import { OpenRouterAdapter } from "./openrouterAdapter";
import { ReplicateAdapter } from "./replicateAdapter";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const encoder = new TextEncoder();

const createReader = (chunks: string[]) => {
  let index = 0;
  return {
    read: vi.fn().mockImplementation(async () => {
      if (index >= chunks.length) {
        return { done: true, value: undefined };
      }
      const value = encoder.encode(chunks[index]);
      index += 1;
      return { done: false, value };
    }),
  };
};

const createStreamResponse = (chunks: string[]) => ({
  ok: true,
  body: {
    getReader: () => createReader(chunks),
  },
});

const collectStream = async (stream: AsyncIterable<StreamChunk>) => {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
};

// Mock child_process for CursorCloudAdapter's git command
vi.mock("child_process", () => ({
  exec: vi.fn((cmd, opts, callback) => {
    if (typeof opts === "function") {
      callback = opts;
    }
    // Simulate git remote origin url command
    if (cmd.includes("remote.origin.url")) {
      const cb = callback as (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;
      cb(null, { stdout: "https://github.com/test/repo\n", stderr: "" });
    }
  }),
}));

describe("OpenRouterAdapter", () => {
  let adapter: OpenRouterAdapter;
  const mockGetApiKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpenRouterAdapter(mockGetApiKey);
  });

  describe("properties", () => {
    it("should have correct type", () => {
      expect(adapter.type).toBe("openrouter");
    });

    it("should have correct display name", () => {
      expect(adapter.displayName).toBe("OpenRouter");
    });

    it("should support streaming", () => {
      expect(adapter.supportsStreaming).toBe(true);
    });

    it("should not support agent mode", () => {
      expect(adapter.supportsAgentMode).toBe(false);
    });
  });

  describe("validateApiKey", () => {
    it("should return false for empty key", async () => {
      expect(await adapter.validateApiKey("")).toBe(false);
    });

    it("should return false for key not starting with sk-or-", async () => {
      expect(await adapter.validateApiKey("sk-123")).toBe(false);
    });

    it("should validate key with API call", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      expect(await adapter.validateApiKey("sk-or-v1-abc123")).toBe(true);
    });

    it("should return false when API call fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });
      expect(await adapter.validateApiKey("sk-or-v1-abc123")).toBe(false);
    });

    it("should return false when API call throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network error"));
      expect(await adapter.validateApiKey("sk-or-v1-abc123")).toBe(false);
    });
  });

  describe("getAvailableModels", () => {
    it("should return list of models", async () => {
      const models = await adapter.getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty("id");
      expect(models[0]).toHaveProperty("name");
      expect(models[0]).toHaveProperty("inputPrice");
      expect(models[0]).toHaveProperty("outputPrice");
    });

    it("should return default models when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);
      const models = await adapter.getAvailableModels();
      expect(models.some((m) => m.id === "anthropic/claude-3.5-sonnet")).toBe(true);
    });

    it("should return API models when request succeeds", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "openai/gpt-4o",
              name: "GPT-4o",
              context_length: 128000,
              pricing: { prompt: "0.000005", completion: "0.000015" },
            },
            {
              id: "meta/llama-3",
              name: "Llama 3",
              context_length: 0,
              pricing: {},
            },
          ],
        }),
      });

      const models = await adapter.getAvailableModels();
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe("openai/gpt-4o");
      expect(models[1].id).toBe("meta/llama-3");
      expect(models[1].supportsTools).toBe(false);
    });

    it("should fall back to default models on API error", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockResolvedValueOnce({ ok: false });

      const models = await adapter.getAvailableModels();
      expect(models.some((m) => m.id === "openai/gpt-4o")).toBe(true);
    });

    it("should fall back to default models when request throws", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockRejectedValueOnce(new Error("boom"));

      const models = await adapter.getAvailableModels();
      expect(models.some((m) => m.id === "openai/gpt-4o-mini")).toBe(true);
    });
  });

  describe("sendTask", () => {
    const mockPrompt: TaskPrompt = {
      title: "Test Task",
      description: "Test description",
      type: "Feature",
      priority: "High",
      filePath: "/path/to/task.md",
    };

    it("should return error when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);
      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("API key not configured");
    });

    it("should send task successfully", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "gen-123",
          choices: [{ message: { content: "Response" } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      });

      const result = await adapter.sendTask(mockPrompt, { model: "anthropic/claude-3.5-sonnet" });
      expect(result.status).toBe("completed");
      expect(result.id).toBe("gen-123");
      expect(result.output).toBe("Response");
    });

    it("should handle API errors", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad request",
      });

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("400");
    });

    it("should return error when request throws", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockRejectedValueOnce(new Error("boom"));

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("Request failed");
    });

    it("should handle missing content in response", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "gen-999",
          choices: [{ message: {} }],
        }),
      });

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("completed");
      expect(result.output).toBe("");
    });
  });

  describe("streamTask", () => {
    const mockPrompt: TaskPrompt = {
      title: "Stream Task",
      description: "Stream description",
      type: "Feature",
      priority: "High",
      filePath: "/path/to/task.md",
      rejectionHistory: "Needs tests",
      prdContent: "PRD content",
    };

    it("should yield error when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "OpenRouter API key not configured" }]);
    });

    it("should stream content and finish on done", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
          "data: {invalid json}\n",
          "data: [DONE]\n",
        ])
      );

      const chunks = await collectStream(
        adapter.streamTask(mockPrompt, { model: "anthropic/claude-3.5-sonnet" })
      );
      expect(chunks).toEqual([
        { type: "text", content: "Hello" },
        { type: "done", content: "" },
      ]);
    });

    it("should yield error for non-ok response", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Server error",
      });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([
        { type: "error", content: "OpenRouter API error (500): Server error" },
      ]);
    });

    it("should yield error when response body is missing", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockResolvedValueOnce({ ok: true, body: null });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "No response body" }]);
    });

    it("should yield error when streaming throws", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockRejectedValueOnce(new Error("stream failed"));

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "Stream failed: Error: stream failed" }]);
    });

    it("should finish when stream ends without done marker", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-or-v1-abc123");
      mockFetch.mockResolvedValueOnce(createStreamResponse(["event: ping\n"]));

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "done", content: "" }]);
    });
  });

  describe("composePrompt", () => {
    it("should include optional sections when provided", () => {
      const composed = (
        adapter as unknown as { composePrompt: (p: TaskPrompt) => string }
      ).composePrompt({
        title: "Prompt Task",
        description: "Details",
        type: "Feature",
        priority: "Low",
        filePath: "/path/to/task.md",
        rejectionHistory: "Needs more",
        prdContent: "PRD",
      });

      expect(composed).toContain("## Description");
      expect(composed).toContain("## Previous Feedback");
      expect(composed).toContain("## Product Requirements Document");
      expect(composed).toContain("## Task File");
    });

    it("should omit optional sections when empty", () => {
      const composed = (
        adapter as unknown as { composePrompt: (p: TaskPrompt) => string }
      ).composePrompt({
        title: "Prompt Task",
        description: "",
        type: "Feature",
        priority: "Low",
        filePath: "",
        rejectionHistory: "",
        prdContent: "",
      });

      expect(composed).not.toContain("## Description");
      expect(composed).not.toContain("## Previous Feedback");
      expect(composed).not.toContain("## Product Requirements Document");
      expect(composed).not.toContain("## Task File");
    });
  });
});

describe("OpenAIAdapter", () => {
  let adapter: OpenAIAdapter;
  const mockGetApiKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpenAIAdapter(mockGetApiKey);
  });

  describe("properties", () => {
    it("should have correct type", () => {
      expect(adapter.type).toBe("openai");
    });

    it("should have correct display name", () => {
      expect(adapter.displayName).toBe("OpenAI");
    });

    it("should support streaming", () => {
      expect(adapter.supportsStreaming).toBe(true);
    });

    it("should not support agent mode", () => {
      expect(adapter.supportsAgentMode).toBe(false);
    });
  });

  describe("validateApiKey", () => {
    it("should return false for empty key", async () => {
      expect(await adapter.validateApiKey("")).toBe(false);
    });

    it("should return false for key not starting with sk-", async () => {
      expect(await adapter.validateApiKey("abc123")).toBe(false);
    });

    it("should validate key with API call", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      expect(await adapter.validateApiKey("sk-abc123")).toBe(true);
    });

    it("should return false when API call throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network error"));
      expect(await adapter.validateApiKey("sk-abc123")).toBe(false);
    });
  });

  describe("getAvailableModels", () => {
    it("should return list of OpenAI models", async () => {
      const models = await adapter.getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.id === "gpt-4o")).toBe(true);
      expect(models.some((m) => m.id === "gpt-4o-mini")).toBe(true);
    });
  });

  describe("sendTask", () => {
    const mockPrompt: TaskPrompt = {
      title: "Test Task",
      description: "Test description",
      type: "Bug",
      priority: "Medium",
      filePath: "/path/to/task.md",
    };

    it("should return error when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);
      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("API key not configured");
    });

    it("should send task successfully", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chatcmpl-123",
          choices: [{ message: { content: "Response" } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      });

      const result = await adapter.sendTask(mockPrompt, { model: "gpt-4o" });
      expect(result.status).toBe("completed");
      expect(result.output).toBe("Response");
    });

    it("should handle API error response", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Rate limit",
      });

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("429");
      expect(result.error).toContain("Rate limit");
    });

    it("should handle missing content in response", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chatcmpl-456",
          choices: [{ message: {} }],
        }),
      });

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("completed");
      expect(result.output).toBe("");
    });

    it("should return error when request throws", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      mockFetch.mockRejectedValueOnce(new Error("boom"));

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("Request failed");
    });
  });

  describe("streamTask", () => {
    const mockPrompt: TaskPrompt = {
      title: "Stream Task",
      description: "Stream description",
      type: "Feature",
      priority: "High",
      filePath: "/path/to/task.md",
      rejectionHistory: "Needs tests",
      prdContent: "PRD content",
    };

    it("should yield error when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "OpenAI API key not configured" }]);
    });

    it("should handle o1 models with non-streaming success", async () => {
      mockGetApiKey.mockResolvedValue("sk-abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "o1-1",
          choices: [{ message: { content: "o1 response" } }],
        }),
      });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, { model: "o1-preview" }));
      expect(chunks).toEqual([
        {
          type: "status",
          content: "o1 models do not support streaming, using non-streaming mode",
        },
        { type: "text", content: "o1 response" },
        { type: "done", content: "" },
      ]);
    });

    it("should surface o1 model errors from sendTask", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      vi.spyOn(adapter, "sendTask").mockResolvedValueOnce({
        id: "",
        status: "error",
        provider: "openai",
        error: "Bad request",
      });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, { model: "o1-mini" }));
      expect(chunks).toEqual([
        {
          type: "status",
          content: "o1 models do not support streaming, using non-streaming mode",
        },
        { type: "error", content: "Bad request" },
      ]);
    });

    it("should fall back to unknown error when o1 response lacks error", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      vi.spyOn(adapter, "sendTask").mockResolvedValueOnce({
        id: "o1-missing-error",
        status: "error",
        provider: "openai",
      });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, { model: "o1-mini" }));
      expect(chunks).toEqual([
        {
          type: "status",
          content: "o1 models do not support streaming, using non-streaming mode",
        },
        { type: "error", content: "Unknown error" },
      ]);
    });

    it("should yield empty text when o1 response lacks output", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      vi.spyOn(adapter, "sendTask").mockResolvedValueOnce({
        id: "o1-empty-output",
        status: "completed",
        provider: "openai",
      });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, { model: "o1-preview" }));
      expect(chunks).toEqual([
        {
          type: "status",
          content: "o1 models do not support streaming, using non-streaming mode",
        },
        { type: "text", content: "" },
        { type: "done", content: "" },
      ]);
    });

    it("should stream content and finish on done", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
          "data: {invalid json}\n",
          "data: [DONE]\n",
        ])
      );

      const chunks = await collectStream(adapter.streamTask(mockPrompt, { model: "gpt-4o" }));
      expect(chunks).toEqual([
        { type: "text", content: "Hello" },
        { type: "done", content: "" },
      ]);
    });

    it("should finish when stream ends without done marker", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      mockFetch.mockResolvedValueOnce(createStreamResponse(["event: ping\n"]));

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "done", content: "" }]);
    });

    it("should yield error for non-ok response", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Server error",
      });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "OpenAI API error (500): Server error" }]);
    });

    it("should yield error when response body is missing", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      mockFetch.mockResolvedValueOnce({ ok: true, body: null });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "No response body" }]);
    });

    it("should yield error when streaming throws", async () => {
      mockGetApiKey.mockResolvedValueOnce("sk-abc123");
      mockFetch.mockRejectedValueOnce(new Error("stream failed"));

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "Stream failed: Error: stream failed" }]);
    });
  });

  describe("composePrompt", () => {
    it("should include optional sections when provided", () => {
      const composed = (
        adapter as unknown as { composePrompt: (p: TaskPrompt) => string }
      ).composePrompt({
        title: "Prompt Task",
        description: "Details",
        type: "Feature",
        priority: "Low",
        filePath: "/path/to/task.md",
        rejectionHistory: "Needs more",
        prdContent: "PRD",
      });

      expect(composed).toContain("## Description");
      expect(composed).toContain("## Previous Feedback");
      expect(composed).toContain("## Product Requirements Document");
      expect(composed).toContain("## Task File");
    });

    it("should omit optional sections when empty", () => {
      const composed = (
        adapter as unknown as { composePrompt: (p: TaskPrompt) => string }
      ).composePrompt({
        title: "Prompt Task",
        description: "",
        type: "Feature",
        priority: "Low",
        filePath: "",
        rejectionHistory: "",
        prdContent: "",
      });

      expect(composed).not.toContain("## Description");
      expect(composed).not.toContain("## Previous Feedback");
      expect(composed).not.toContain("## Product Requirements Document");
      expect(composed).not.toContain("## Task File");
    });
  });
});

describe("CursorCloudAdapter", () => {
  let adapter: CursorCloudAdapter;
  const mockGetApiKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup vscode workspace mock after clearAllMocks
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue(""),
    } as unknown as vscode.WorkspaceConfiguration);
    adapter = new CursorCloudAdapter(mockGetApiKey);
  });

  describe("properties", () => {
    it("should have correct type", () => {
      expect(adapter.type).toBe("cursor");
    });

    it("should have correct display name", () => {
      expect(adapter.displayName).toBe("Cursor Cloud Agent");
    });

    it("should not support streaming", () => {
      expect(adapter.supportsStreaming).toBe(false);
    });

    it("should support agent mode", () => {
      expect(adapter.supportsAgentMode).toBe(true);
    });
  });

  describe("validateApiKey", () => {
    it("should return false for empty key", async () => {
      expect(await adapter.validateApiKey("")).toBe(false);
    });

    it("should return false for key shorter than 20 characters", async () => {
      expect(await adapter.validateApiKey("short_key")).toBe(false);
    });

    it("should validate key with at least 20 characters", async () => {
      expect(await adapter.validateApiKey("cak_12345678901234567890")).toBe(true);
    });
  });

  describe("getAvailableModels", () => {
    it("should return cursor-agent model only", async () => {
      const models = await adapter.getAvailableModels();
      expect(models.length).toBe(1);
      expect(models[0].id).toBe("cursor-agent");
    });
  });

  describe("sendTask", () => {
    const mockPrompt: TaskPrompt = {
      title: "Test Task",
      description: "Test description",
      type: "Feature",
      priority: "High",
      filePath: "/path/to/task.md",
    };

    it("should return error when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);
      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("API key not configured");
    });

    it("should create agent successfully", async () => {
      mockGetApiKey.mockResolvedValueOnce("cak_12345678901234567890");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "agent-123",
          status: "RUNNING",
          target: {
            branchName: "ai/task-123",
          },
        }),
      });

      const result = await adapter.sendTask(mockPrompt, { createPR: true });
      expect(result.status).toBe("running");
      expect(result.id).toBe("agent-123");
      expect(result.branchName).toBe("ai/task-123");
    });

    it("should omit target when createPR is false", async () => {
      mockGetApiKey.mockResolvedValueOnce("cak_12345678901234567890");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "agent-124",
          status: "RUNNING",
        }),
      });

      await adapter.sendTask(mockPrompt, { createPR: false });

      const requestBody = JSON.parse(
        (mockFetch.mock.calls[0][1] as { body: string }).body
      ) as Record<string, unknown>;
      expect(requestBody.target).toBeUndefined();
    });

    it("should return error when API responds with error", async () => {
      mockGetApiKey.mockResolvedValueOnce("cak_12345678901234567890");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Server error",
      });

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("500");
    });

    it("should return error when request throws", async () => {
      mockGetApiKey.mockResolvedValueOnce("cak_12345678901234567890");
      mockFetch.mockRejectedValueOnce(new Error("boom"));

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("Request failed");
    });
  });

  describe("checkStatus", () => {
    it("should check agent status", async () => {
      mockGetApiKey.mockResolvedValueOnce("cak_12345678901234567890");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "agent-123",
          status: "FINISHED",
          target: {
            prUrl: "https://github.com/test/pull/1",
          },
        }),
      });

      const result = await adapter.checkStatus("agent-123");
      expect(result.status).toBe("completed");
      expect(result.prUrl).toBe("https://github.com/test/pull/1");
    });

    it("should return error when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);
      const result = await adapter.checkStatus("agent-123");
      expect(result.status).toBe("error");
      expect(result.error).toContain("API key not configured");
    });

    it("should return error when API responds with error", async () => {
      mockGetApiKey.mockResolvedValueOnce("cak_12345678901234567890");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not found",
      });

      const result = await adapter.checkStatus("agent-404");
      expect(result.status).toBe("error");
      expect(result.error).toContain("404");
    });

    it("should return error when request throws", async () => {
      mockGetApiKey.mockResolvedValueOnce("cak_12345678901234567890");
      mockFetch.mockRejectedValueOnce(new Error("boom"));

      const result = await adapter.checkStatus("agent-500");
      expect(result.status).toBe("error");
      expect(result.error).toContain("Status check failed");
    });
  });

  describe("cancelTask", () => {
    it("should throw when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);
      await expect(adapter.cancelTask("agent-1")).rejects.toThrow("Cursor API key not configured");
    });

    it("should throw when API responds with error", async () => {
      mockGetApiKey.mockResolvedValueOnce("cak_12345678901234567890");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => "Bad request",
      });

      await expect(adapter.cancelTask("agent-2")).rejects.toThrow(
        "Failed to cancel agent: Bad request"
      );
    });

    it("should resolve when cancellation succeeds", async () => {
      mockGetApiKey.mockResolvedValueOnce("cak_12345678901234567890");
      mockFetch.mockResolvedValueOnce({ ok: true });

      await expect(adapter.cancelTask("agent-3")).resolves.toBeUndefined();
    });
  });

  describe("repository detection", () => {
    it("should return configured repository URL when set", async () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
        get: vi.fn().mockReturnValue("  https://github.com/custom/repo  "),
      } as unknown as vscode.WorkspaceConfiguration);

      const url = await (
        adapter as unknown as { getRepositoryUrl: () => Promise<string> }
      ).getRepositoryUrl();
      expect(url).toBe("https://github.com/custom/repo");
    });

    it("should return detected URL when config is empty", async () => {
      vi.spyOn(
        adapter as unknown as { detectGitRepositoryUrl: () => Promise<string | null> },
        "detectGitRepositoryUrl"
      ).mockResolvedValueOnce("https://github.com/detected/repo");
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
        get: vi.fn().mockReturnValue(""),
      } as unknown as vscode.WorkspaceConfiguration);

      const url = await (
        adapter as unknown as { getRepositoryUrl: () => Promise<string> }
      ).getRepositoryUrl();
      expect(url).toBe("https://github.com/detected/repo");
    });

    it("should fall back to placeholder when detection fails", async () => {
      vi.spyOn(
        adapter as unknown as { detectGitRepositoryUrl: () => Promise<string | null> },
        "detectGitRepositoryUrl"
      ).mockResolvedValueOnce(null);
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
        get: vi.fn().mockReturnValue(""),
      } as unknown as vscode.WorkspaceConfiguration);

      const url = await (
        adapter as unknown as { getRepositoryUrl: () => Promise<string> }
      ).getRepositoryUrl();
      expect(url).toBe("https://github.com/user/repo");
    });
  });

  describe("detectGitRepositoryUrl", () => {
    it("should return null when no workspace folders", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = undefined;

      const url = await (
        adapter as unknown as { detectGitRepositoryUrl: () => Promise<string | null> }
      ).detectGitRepositoryUrl();
      expect(url).toBeNull();
    });

    it("should fall back when git API is unavailable", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.extensions.getExtension).mockReturnValue({
        isActive: true,
        exports: {
          getAPI: () => null,
        },
      } as unknown as vscode.Extension<unknown>);

      const url = await (
        adapter as unknown as { detectGitRepositoryUrl: () => Promise<string | null> }
      ).detectGitRepositoryUrl();
      expect(url).toContain("github.com");
    });

    it("should fall back when repository is missing", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.extensions.getExtension).mockReturnValue({
        isActive: true,
        exports: {
          getAPI: () => ({
            getRepository: () => undefined,
          }),
        },
      } as unknown as vscode.Extension<unknown>);

      const url = await (
        adapter as unknown as { detectGitRepositoryUrl: () => Promise<string | null> }
      ).detectGitRepositoryUrl();
      expect(url).toContain("github.com");
    });

    it("should fall back when origin URL is missing", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.extensions.getExtension).mockReturnValue({
        isActive: true,
        exports: {
          getAPI: () => ({
            getRepository: () => ({
              state: { remotes: [{ name: "origin" }] },
            }),
          }),
        },
      } as unknown as vscode.Extension<unknown>);

      const url = await (
        adapter as unknown as { detectGitRepositoryUrl: () => Promise<string | null> }
      ).detectGitRepositoryUrl();
      expect(url).toContain("github.com");
    });

    it("should use git extension when available", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.extensions.getExtension).mockReturnValue({
        isActive: true,
        exports: {
          getAPI: () => ({
            getRepository: () => ({
              state: { remotes: [{ name: "origin", fetchUrl: "git@github.com:user/repo.git" }] },
            }),
          }),
        },
      } as unknown as vscode.Extension<unknown>);

      const url = await (
        adapter as unknown as { detectGitRepositoryUrl: () => Promise<string | null> }
      ).detectGitRepositoryUrl();
      expect(url).toContain("github.com");
      expect(url).not.toContain(".git");
    });

    it("should fall back to git command when extension is unavailable", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);

      const url = await (
        adapter as unknown as { detectGitRepositoryUrl: () => Promise<string | null> }
      ).detectGitRepositoryUrl();
      expect(url).toBe("https://github.com/test/repo");
    });

    it("should return null when git command returns empty output", async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ] as unknown as readonly vscode.WorkspaceFolder[];
      vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);
      vi.mocked(exec).mockImplementationOnce((_cmd, opts, callback) => {
        if (typeof opts === "function") {
          callback = opts;
        }
        const cb = callback as (
          error: Error | null,
          result: { stdout: string; stderr: string }
        ) => void;
        cb(null, { stdout: "", stderr: "" });
      });

      const url = await (
        adapter as unknown as { detectGitRepositoryUrl: () => Promise<string | null> }
      ).detectGitRepositoryUrl();
      expect(url).toBeNull();
    });
  });

  describe("mapStatus", () => {
    it("should map cursor statuses", () => {
      const mapStatus = (adapter as unknown as { mapStatus: (status: string) => string }).mapStatus;
      expect(mapStatus("CREATING")).toBe("running");
      expect(mapStatus("RUNNING")).toBe("running");
      expect(mapStatus("FINISHED")).toBe("completed");
      expect(mapStatus("ERROR")).toBe("error");
      expect(mapStatus("UNKNOWN")).toBe("pending");
    });
  });

  describe("normalizeGitUrl", () => {
    it("should normalize ssh URLs", () => {
      const normalize = (adapter as unknown as { normalizeGitUrl: (url: string) => string })
        .normalizeGitUrl;
      const sshNormalized = normalize("git@github.com:user/repo.git");
      const httpsNormalized = normalize("https://github.com/user/repo.git");
      expect(sshNormalized).toContain("github.com");
      expect(sshNormalized).not.toContain(".git");
      expect(httpsNormalized).toContain("github.com");
      expect(httpsNormalized).not.toContain(".git");
    });
  });

  describe("composePrompt", () => {
    it("should include optional sections when provided", () => {
      const composed = (
        adapter as unknown as { composePrompt: (p: TaskPrompt) => string }
      ).composePrompt({
        title: "Prompt Task",
        description: "Details",
        type: "Feature",
        priority: "Low",
        filePath: "/path/to/task.md",
        rejectionHistory: "Needs more",
        prdContent: "PRD",
      });

      expect(composed).toContain("## Description");
      expect(composed).toContain("## Previous Feedback");
      expect(composed).toContain("## Product Requirements Document");
      expect(composed).toContain("## Task File");
    });

    it("should omit optional sections when empty", () => {
      const composed = (
        adapter as unknown as { composePrompt: (p: TaskPrompt) => string }
      ).composePrompt({
        title: "Prompt Task",
        description: "",
        type: "Feature",
        priority: "Low",
        filePath: "",
        rejectionHistory: "",
        prdContent: "",
      });

      expect(composed).not.toContain("## Description");
      expect(composed).not.toContain("## Previous Feedback");
      expect(composed).not.toContain("## Product Requirements Document");
      expect(composed).not.toContain("## Task File");
    });
  });
});

describe("ReplicateAdapter", () => {
  let adapter: ReplicateAdapter;
  const mockGetApiKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ReplicateAdapter(mockGetApiKey);
  });

  describe("properties", () => {
    it("should have correct type", () => {
      expect(adapter.type).toBe("replicate");
    });

    it("should have correct display name", () => {
      expect(adapter.displayName).toBe("Replicate");
    });

    it("should support streaming", () => {
      expect(adapter.supportsStreaming).toBe(true);
    });

    it("should not support agent mode", () => {
      expect(adapter.supportsAgentMode).toBe(false);
    });
  });

  describe("validateApiKey", () => {
    it("should return false for empty key", async () => {
      expect(await adapter.validateApiKey("")).toBe(false);
    });

    it("should return false for key not starting with r8_", async () => {
      expect(await adapter.validateApiKey("abc123")).toBe(false);
    });

    it("should validate key with API call", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      expect(await adapter.validateApiKey("r8_abc123")).toBe(true);
    });

    it("should return false when API responds with error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });
      expect(await adapter.validateApiKey("r8_abc123")).toBe(false);
    });

    it("should return false when API call throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("boom"));
      expect(await adapter.validateApiKey("r8_abc123")).toBe(false);
    });
  });

  describe("getAvailableModels", () => {
    it("should return list of Replicate models", async () => {
      const models = await adapter.getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.provider === "meta")).toBe(true);
    });
  });

  describe("sendTask", () => {
    const mockPrompt: TaskPrompt = {
      title: "Test Task",
      description: "Test description",
      type: "Feature",
      priority: "High",
      filePath: "/path/to/task.md",
    };

    it("should return error when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);
      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("API token not configured");
    });

    it("should create prediction successfully", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-123",
          status: "starting",
        }),
      });

      const result = await adapter.sendTask(mockPrompt, {
        model: "meta/meta-llama-3.1-70b-instruct",
      });
      expect(result.status).toBe("running");
      expect(result.id).toBe("pred-123");
    });

    it("should return error when API responds with error", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad request",
      });

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("400");
    });

    it("should return error when prediction fails", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-124",
          status: "failed",
          error: "Model error",
        }),
      });

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("Model error");
    });

    it("should use fallback error when prediction fails without message", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-124b",
          status: "failed",
        }),
      });

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("Prediction failed");
    });

    it("should return completed output when prediction succeeds", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-125",
          status: "succeeded",
          output: ["Hello", " world"],
        }),
      });

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("completed");
      expect(result.output).toBe("Hello world");
    });

    it("should handle non-array output when prediction succeeds", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-125b",
          status: "succeeded",
          output: "Single output",
        }),
      });

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("completed");
      expect(result.output).toBe("Single output");
    });

    it("should return empty output when prediction succeeds without output", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-125c",
          status: "succeeded",
        }),
      });

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("completed");
      expect(result.output).toBe("");
    });

    it("should return error when request throws", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockRejectedValueOnce(new Error("boom"));

      const result = await adapter.sendTask(mockPrompt, {});
      expect(result.status).toBe("error");
      expect(result.error).toContain("Request failed");
    });
  });

  describe("checkStatus", () => {
    it("should check prediction status", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-123",
          status: "succeeded",
          output: ["Generated", " response"],
        }),
      });

      const result = await adapter.checkStatus("pred-123");
      expect(result.status).toBe("completed");
      expect(result.output).toBe("Generated response");
    });

    it("should handle non-array output in status response", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-123b",
          status: "processing",
          output: "Partial output",
        }),
      });

      const result = await adapter.checkStatus("pred-123b");
      expect(result.status).toBe("running");
      expect(result.output).toBe("Partial output");
    });

    it("should default output to empty string when status response has no output", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-123c",
          status: "processing",
        }),
      });

      const result = await adapter.checkStatus("pred-123c");
      expect(result.status).toBe("running");
      expect(result.output).toBe("");
    });

    it("should return error when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);
      const result = await adapter.checkStatus("pred-124");
      expect(result.status).toBe("error");
      expect(result.error).toContain("API token not configured");
    });

    it("should return error when API responds with error", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not found",
      });

      const result = await adapter.checkStatus("pred-404");
      expect(result.status).toBe("error");
      expect(result.error).toContain("404");
    });

    it("should return error when request throws", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockRejectedValueOnce(new Error("boom"));

      const result = await adapter.checkStatus("pred-500");
      expect(result.status).toBe("error");
      expect(result.error).toContain("Status check failed");
    });
  });

  describe("cancelTask", () => {
    it("should throw when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);
      await expect(adapter.cancelTask("pred-1")).rejects.toThrow(
        "Replicate API token not configured"
      );
    });

    it("should throw when API responds with error", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => "Bad request",
      });

      await expect(adapter.cancelTask("pred-2")).rejects.toThrow(
        "Failed to cancel prediction: Bad request"
      );
    });

    it("should resolve when cancellation succeeds", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({ ok: true });

      await expect(adapter.cancelTask("pred-3")).resolves.toBeUndefined();
    });
  });

  describe("streamTask", () => {
    const mockPrompt: TaskPrompt = {
      title: "Stream Task",
      description: "Stream description",
      type: "Feature",
      priority: "High",
      filePath: "/path/to/task.md",
      rejectionHistory: "Needs tests",
      prdContent: "PRD content",
    };

    it("should yield error when no API key", async () => {
      mockGetApiKey.mockResolvedValueOnce(undefined);

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "Replicate API token not configured" }]);
    });

    it("should yield error when prediction creation fails", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Server error",
      });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([
        { type: "error", content: "Replicate API error (500): Server error" },
      ]);
    });

    it("should poll when no stream URL and surface completion", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-200",
        }),
      });
      vi.spyOn(
        adapter as unknown as { pollForCompletion: (id: string) => Promise<unknown> },
        "pollForCompletion"
      ).mockResolvedValueOnce({
        id: "pred-200",
        status: "completed",
        provider: "replicate",
        output: "Result",
      });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([
        { type: "status", content: "Streaming not available, polling for result..." },
        { type: "text", content: "Result" },
        { type: "done", content: "" },
      ]);
    });

    it("should poll when no stream URL and surface errors", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-201",
        }),
      });
      vi.spyOn(
        adapter as unknown as { pollForCompletion: (id: string) => Promise<unknown> },
        "pollForCompletion"
      ).mockResolvedValueOnce({
        id: "pred-201",
        status: "error",
        provider: "replicate",
        error: "Failed",
      });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([
        { type: "status", content: "Streaming not available, polling for result..." },
        { type: "error", content: "Failed" },
      ]);
    });

    it("should surface unknown errors when polling fails without message", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-202",
        }),
      });
      vi.spyOn(
        adapter as unknown as { pollForCompletion: (id: string) => Promise<unknown> },
        "pollForCompletion"
      ).mockResolvedValueOnce({
        id: "pred-202",
        status: "error",
        provider: "replicate",
      });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([
        { type: "status", content: "Streaming not available, polling for result..." },
        { type: "error", content: "Unknown error" },
      ]);
    });

    it("should handle polling success without output", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pred-203",
        }),
      });
      vi.spyOn(
        adapter as unknown as { pollForCompletion: (id: string) => Promise<unknown> },
        "pollForCompletion"
      ).mockResolvedValueOnce({
        id: "pred-203",
        status: "completed",
        provider: "replicate",
      });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([
        { type: "status", content: "Streaming not available, polling for result..." },
        { type: "text", content: "" },
        { type: "done", content: "" },
      ]);
    });

    it("should handle streaming events", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "pred-300",
            urls: { stream: "https://example.com/stream" },
          }),
        })
        .mockResolvedValueOnce(createStreamResponse(["data: chunk\n", "event: done\n"]));

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([
        { type: "text", content: "chunk" },
        { type: "done", content: "" },
      ]);
    });

    it("should ignore unknown stream events", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "pred-305",
            urls: { stream: "https://example.com/stream" },
          }),
        })
        .mockResolvedValueOnce(createStreamResponse(["event: ping\n", "id: 1\n", "data: chunk\n"]));

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([
        { type: "text", content: "chunk" },
        { type: "done", content: "" },
      ]);
    });

    it("should ignore empty data chunks and finish on end", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "pred-304",
            urls: { stream: "https://example.com/stream" },
          }),
        })
        .mockResolvedValueOnce(createStreamResponse(["data: \n"]));

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "done", content: "" }]);
    });

    it("should return error when stream response is not ok", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "pred-301",
            urls: { stream: "https://example.com/stream" },
          }),
        })
        .mockResolvedValueOnce({ ok: false, status: 502 });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "Stream connection failed: 502" }]);
    });

    it("should return error when stream body is missing", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "pred-302",
            urls: { stream: "https://example.com/stream" },
          }),
        })
        .mockResolvedValueOnce({ ok: true, body: null });

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "No stream body" }]);
    });

    it("should handle stream error events", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "pred-303",
            urls: { stream: "https://example.com/stream" },
          }),
        })
        .mockResolvedValueOnce(createStreamResponse(["event: error\n"]));

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "Stream error" }]);
    });

    it("should yield error when streaming throws", async () => {
      mockGetApiKey.mockResolvedValueOnce("r8_abc123");
      mockFetch.mockRejectedValueOnce(new Error("stream failed"));

      const chunks = await collectStream(adapter.streamTask(mockPrompt, {}));
      expect(chunks).toEqual([{ type: "error", content: "Stream failed: Error: stream failed" }]);
    });
  });

  describe("pollForCompletion", () => {
    it("should return when prediction completes", async () => {
      const spy = vi
        .spyOn(adapter, "checkStatus")
        .mockResolvedValue({ id: "pred-done", status: "completed", provider: "replicate" });

      const result = (await (
        adapter as unknown as {
          pollForCompletion: (id: string, maxAttempts: number) => Promise<unknown>;
        }
      ).pollForCompletion("pred-done", 1)) as { status: string };

      expect(result.status).toBe("completed");
      spy.mockRestore();
    });

    it("should return timeout error after max attempts", async () => {
      const spy = vi
        .spyOn(adapter, "checkStatus")
        .mockResolvedValue({ id: "pred-timeout", status: "pending", provider: "replicate" });
      vi.useFakeTimers();

      const pollPromise = (
        adapter as unknown as {
          pollForCompletion: (id: string, maxAttempts: number) => Promise<unknown>;
        }
      ).pollForCompletion("pred-timeout", 1);
      await vi.advanceTimersByTimeAsync(2000);
      const result = (await pollPromise) as { status: string; error?: string };

      expect(result.status).toBe("error");
      expect(result.error).toContain("Prediction timed out");
      spy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe("mapStatus", () => {
    it("should map replicate statuses", () => {
      const mapStatus = (adapter as unknown as { mapStatus: (status: string) => string }).mapStatus;
      expect(mapStatus("starting")).toBe("running");
      expect(mapStatus("processing")).toBe("running");
      expect(mapStatus("succeeded")).toBe("completed");
      expect(mapStatus("failed")).toBe("error");
      expect(mapStatus("canceled")).toBe("error");
      expect(mapStatus("unknown")).toBe("pending");
    });
  });

  describe("composePrompt", () => {
    it("should include optional sections when provided", () => {
      const composed = (
        adapter as unknown as { composePrompt: (p: TaskPrompt) => string }
      ).composePrompt({
        title: "Prompt Task",
        description: "Details",
        type: "Feature",
        priority: "Low",
        filePath: "/path/to/task.md",
        rejectionHistory: "Needs more",
        prdContent: "PRD",
      });

      expect(composed).toContain("## Description");
      expect(composed).toContain("## Previous Feedback");
      expect(composed).toContain("## Product Requirements Document");
      expect(composed).toContain("## Task File");
    });

    it("should omit optional sections when empty", () => {
      const composed = (
        adapter as unknown as { composePrompt: (p: TaskPrompt) => string }
      ).composePrompt({
        title: "Prompt Task",
        description: "",
        type: "Feature",
        priority: "Low",
        filePath: "",
        rejectionHistory: "",
        prdContent: "",
      });

      expect(composed).not.toContain("## Description");
      expect(composed).not.toContain("## Previous Feedback");
      expect(composed).not.toContain("## Product Requirements Document");
      expect(composed).not.toContain("## Task File");
    });
  });
});
