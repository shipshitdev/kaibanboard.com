import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiKeyManager } from "../config/apiKeyManager";
import type { AIProviderAdapter, ProviderType } from "../types/aiProvider";
import { ProviderRegistry } from "./providerRegistry";

// Create mock adapter
function createMockAdapter(type: ProviderType, displayName: string): AIProviderAdapter {
  return {
    type,
    displayName,
    supportsStreaming: true,
    supportsAgentMode: false,
    validateApiKey: vi.fn().mockResolvedValue(true),
    getAvailableModels: vi.fn().mockResolvedValue([]),
    sendTask: vi.fn().mockResolvedValue({ id: "1", status: "completed", provider: type }),
  };
}

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;
  let mockApiKeyManager: ApiKeyManager;

  beforeEach(() => {
    mockApiKeyManager = {
      getApiKey: vi.fn(),
      setApiKey: vi.fn(),
      deleteApiKey: vi.fn(),
      hasApiKey: vi.fn(),
      getAllConfiguredProviders: vi.fn(),
      getProviderInfo: vi.fn(),
      validateKeyFormat: vi.fn(),
    } as unknown as ApiKeyManager;

    registry = new ProviderRegistry(mockApiKeyManager);
  });

  describe("registerAdapter", () => {
    it("should register an adapter", () => {
      const adapter = createMockAdapter("openai", "OpenAI");
      registry.registerAdapter(adapter);
      expect(registry.getAdapter("openai")).toBe(adapter);
    });

    it("should overwrite existing adapter of same type", () => {
      const adapter1 = createMockAdapter("openai", "OpenAI v1");
      const adapter2 = createMockAdapter("openai", "OpenAI v2");
      registry.registerAdapter(adapter1);
      registry.registerAdapter(adapter2);
      expect(registry.getAdapter("openai")).toBe(adapter2);
    });
  });

  describe("getAdapter", () => {
    it("should return registered adapter", () => {
      const adapter = createMockAdapter("openrouter", "OpenRouter");
      registry.registerAdapter(adapter);
      expect(registry.getAdapter("openrouter")).toBe(adapter);
    });

    it("should return undefined for unregistered adapter", () => {
      expect(registry.getAdapter("openai")).toBeUndefined();
    });
  });

  describe("getAllAdapters", () => {
    it("should return all registered adapters", () => {
      const adapter1 = createMockAdapter("openai", "OpenAI");
      const adapter2 = createMockAdapter("openrouter", "OpenRouter");
      registry.registerAdapter(adapter1);
      registry.registerAdapter(adapter2);

      expect(registry.getAllAdapters()).toEqual([adapter1, adapter2]);
    });
  });

  describe("getEnabledAdapters", () => {
    it("should return adapters with configured API keys", async () => {
      const adapter1 = createMockAdapter("openai", "OpenAI");
      const adapter2 = createMockAdapter("openrouter", "OpenRouter");
      registry.registerAdapter(adapter1);
      registry.registerAdapter(adapter2);
      (mockApiKeyManager.getAllConfiguredProviders as ReturnType<typeof vi.fn>).mockResolvedValue([
        "openai",
        "openrouter",
      ]);

      const adapters = await registry.getEnabledAdapters();
      expect(adapters).toHaveLength(2);
      expect(adapters).toContain(adapter1);
      expect(adapters).toContain(adapter2);
    });

    it("should return empty array when no providers configured", async () => {
      const adapter1 = createMockAdapter("openai", "OpenAI");
      registry.registerAdapter(adapter1);
      (mockApiKeyManager.getAllConfiguredProviders as ReturnType<typeof vi.fn>).mockResolvedValue(
        []
      );

      const adapters = await registry.getEnabledAdapters();
      expect(adapters).toHaveLength(0);
    });
  });

  describe("getAvailableProviders", () => {
    it("should return provider configs with enabled status", async () => {
      const adapter = createMockAdapter("openai", "OpenAI");
      registry.registerAdapter(adapter);
      (mockApiKeyManager.hasApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const providers = await registry.getAvailableProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].type).toBe("openai");
      expect(providers[0].name).toBe("OpenAI");
      expect(providers[0].enabled).toBe(true);
    });

    it("should mark provider as disabled when no API key", async () => {
      const adapter = createMockAdapter("openai", "OpenAI");
      registry.registerAdapter(adapter);
      (mockApiKeyManager.hasApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const providers = await registry.getAvailableProviders();
      expect(providers[0].enabled).toBe(false);
    });
  });

  describe("isProviderAvailable", () => {
    it("should return false when adapter is not registered", async () => {
      await expect(registry.isProviderAvailable("cursor")).resolves.toBe(false);
    });

    it("should return true when adapter exists and API key is configured", async () => {
      const adapter = createMockAdapter("openai", "OpenAI");
      registry.registerAdapter(adapter);
      (mockApiKeyManager.hasApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(registry.isProviderAvailable("openai")).resolves.toBe(true);
    });
  });

  describe("getProviderWithModels", () => {
    it("should return null when adapter is missing", async () => {
      const result = await registry.getProviderWithModels("replicate");
      expect(result).toBeNull();
    });

    it("should return null when no API key is configured", async () => {
      const adapter = createMockAdapter("openrouter", "OpenRouter");
      registry.registerAdapter(adapter);
      (mockApiKeyManager.hasApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await registry.getProviderWithModels("openrouter");
      expect(result).toBeNull();
    });

    it("should return adapter and models when configured", async () => {
      const adapter = createMockAdapter("openrouter", "OpenRouter");
      const models = [{ id: "model-1" }];
      adapter.getAvailableModels = vi.fn().mockResolvedValue(models);
      registry.registerAdapter(adapter);
      (mockApiKeyManager.hasApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await registry.getProviderWithModels("openrouter");
      expect(result?.adapter).toBe(adapter);
      expect(result?.models).toBe(models);
    });
  });
});
