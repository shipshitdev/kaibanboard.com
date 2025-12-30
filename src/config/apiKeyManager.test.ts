import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SecretStorage } from "vscode";
import { ApiKeyManager } from "./apiKeyManager";

describe("ApiKeyManager", () => {
  let apiKeyManager: ApiKeyManager;
  let mockSecretStorage: SecretStorage;

  beforeEach(() => {
    mockSecretStorage = {
      get: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
      onDidChange: vi.fn(),
    };
    apiKeyManager = new ApiKeyManager(mockSecretStorage);
  });

  describe("getApiKey", () => {
    it("should retrieve API key from secret storage", async () => {
      (mockSecretStorage.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce("sk-abc123");
      const key = await apiKeyManager.getApiKey("openai");
      expect(mockSecretStorage.get).toHaveBeenCalledWith("kaiban.apiKey.openai");
      expect(key).toBe("sk-abc123");
    });

    it("should return undefined when key not found", async () => {
      (mockSecretStorage.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
      const key = await apiKeyManager.getApiKey("openai");
      expect(key).toBeUndefined();
    });
  });

  describe("setApiKey", () => {
    it("should store API key in secret storage", async () => {
      await apiKeyManager.setApiKey("openai", "sk-abc123");
      expect(mockSecretStorage.store).toHaveBeenCalledWith("kaiban.apiKey.openai", "sk-abc123");
    });
  });

  describe("deleteApiKey", () => {
    it("should delete API key from secret storage", async () => {
      await apiKeyManager.deleteApiKey("openai");
      expect(mockSecretStorage.delete).toHaveBeenCalledWith("kaiban.apiKey.openai");
    });
  });

  describe("hasApiKey", () => {
    it("should return true when key exists", async () => {
      (mockSecretStorage.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce("sk-abc123");
      const hasKey = await apiKeyManager.hasApiKey("openai");
      expect(hasKey).toBe(true);
    });

    it("should return false when key does not exist", async () => {
      (mockSecretStorage.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
      const hasKey = await apiKeyManager.hasApiKey("openai");
      expect(hasKey).toBe(false);
    });
  });

  describe("getAllConfiguredProviders", () => {
    it("should return list of configured providers", async () => {
      // The method checks providers in order: cursor, openai, openrouter, replicate
      (mockSecretStorage.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(undefined) // cursor
        .mockResolvedValueOnce("sk-abc123") // openai
        .mockResolvedValueOnce("sk-or-v1-abc") // openrouter
        .mockResolvedValueOnce(undefined); // replicate

      const providers = await apiKeyManager.getAllConfiguredProviders();
      expect(providers).toContain("openai");
      expect(providers).toContain("openrouter");
      expect(providers).not.toContain("cursor");
      expect(providers).not.toContain("replicate");
    });
  });

  describe("getProviderInfo", () => {
    it("should return OpenAI provider info", () => {
      const info = apiKeyManager.getProviderInfo("openai");
      expect(info.name).toBe("OpenAI");
      expect(info.placeholder).toContain("sk-");
    });

    it("should return OpenRouter provider info", () => {
      const info = apiKeyManager.getProviderInfo("openrouter");
      expect(info.name).toBe("OpenRouter");
      expect(info.placeholder).toContain("sk-or-");
    });

    it("should return Cursor provider info", () => {
      const info = apiKeyManager.getProviderInfo("cursor");
      expect(info.name).toBe("Cursor Cloud");
    });

    it("should return Replicate provider info", () => {
      const info = apiKeyManager.getProviderInfo("replicate");
      expect(info.name).toBe("Replicate");
      expect(info.placeholder).toContain("r8_");
    });
  });

  describe("validateKeyFormat", () => {
    it("should validate OpenAI key format", () => {
      expect(apiKeyManager.validateKeyFormat("openai", "sk-abc123").valid).toBe(true);
      expect(apiKeyManager.validateKeyFormat("openai", "abc123").valid).toBe(false);
    });

    it("should validate OpenRouter key format", () => {
      expect(apiKeyManager.validateKeyFormat("openrouter", "sk-or-v1-abc123").valid).toBe(true);
      expect(apiKeyManager.validateKeyFormat("openrouter", "sk-abc123").valid).toBe(false);
    });

    it("should validate Replicate key format", () => {
      expect(apiKeyManager.validateKeyFormat("replicate", "r8_abc123").valid).toBe(true);
      expect(apiKeyManager.validateKeyFormat("replicate", "abc123").valid).toBe(false);
    });

    it("should validate Cursor key minimum length", () => {
      // Cursor keys need to be at least 20 characters
      expect(apiKeyManager.validateKeyFormat("cursor", "12345678901234567890").valid).toBe(true);
      expect(apiKeyManager.validateKeyFormat("cursor", "short").valid).toBe(false);
      expect(apiKeyManager.validateKeyFormat("cursor", "").valid).toBe(false);
    });
  });
});
