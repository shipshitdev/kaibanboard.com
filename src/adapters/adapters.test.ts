import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskPrompt } from "../types/aiProvider";
import { CursorCloudAdapter } from "./cursorCloudAdapter";
import { OpenAIAdapter } from "./openaiAdapter";
import { OpenRouterAdapter } from "./openrouterAdapter";
import { ReplicateAdapter } from "./replicateAdapter";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

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
  });
});

describe("CursorCloudAdapter", () => {
  let adapter: CursorCloudAdapter;
  const mockGetApiKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
