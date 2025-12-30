/**
 * API Key Manager
 * Secure storage and retrieval of API keys using VS Code's SecretStorage
 */

import type * as vscode from "vscode";
import type { ProviderType } from "../types/aiProvider";

export class ApiKeyManager {
  private static readonly KEY_PREFIX = "kaiban.apiKey.";

  constructor(private readonly secretStorage: vscode.SecretStorage) {}

  /**
   * Get the storage key for a provider
   */
  private getStorageKey(provider: ProviderType): string {
    return `${ApiKeyManager.KEY_PREFIX}${provider}`;
  }

  /**
   * Get the API key for a provider
   */
  async getApiKey(provider: ProviderType): Promise<string | undefined> {
    return this.secretStorage.get(this.getStorageKey(provider));
  }

  /**
   * Set the API key for a provider
   */
  async setApiKey(provider: ProviderType, key: string): Promise<void> {
    await this.secretStorage.store(this.getStorageKey(provider), key);
  }

  /**
   * Delete the API key for a provider
   */
  async deleteApiKey(provider: ProviderType): Promise<void> {
    await this.secretStorage.delete(this.getStorageKey(provider));
  }

  /**
   * Check if an API key exists for a provider
   */
  async hasApiKey(provider: ProviderType): Promise<boolean> {
    const key = await this.getApiKey(provider);
    return key !== undefined && key.length > 0;
  }

  /**
   * Get all providers that have API keys configured
   */
  async getAllConfiguredProviders(): Promise<ProviderType[]> {
    const providers: ProviderType[] = ["cursor", "openai", "openrouter", "replicate"];
    const configured: ProviderType[] = [];

    for (const provider of providers) {
      if (await this.hasApiKey(provider)) {
        configured.push(provider);
      }
    }

    return configured;
  }

  /**
   * Validate API key format for a provider (basic validation)
   */
  validateKeyFormat(provider: ProviderType, key: string): { valid: boolean; error?: string } {
    if (!key || key.trim().length === 0) {
      return { valid: false, error: "API key cannot be empty" };
    }

    switch (provider) {
      case "cursor":
        // Cursor API keys have a specific format
        if (key.length < 20) {
          return { valid: false, error: "Cursor API key appears too short" };
        }
        break;

      case "openai":
        // OpenAI keys start with sk-
        if (!key.startsWith("sk-")) {
          return { valid: false, error: "OpenAI API key should start with 'sk-'" };
        }
        break;

      case "openrouter":
        // OpenRouter keys start with sk-or-
        if (!key.startsWith("sk-or-")) {
          return { valid: false, error: "OpenRouter API key should start with 'sk-or-'" };
        }
        break;

      case "replicate":
        // Replicate tokens start with r8_
        if (!key.startsWith("r8_")) {
          return { valid: false, error: "Replicate API token should start with 'r8_'" };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Get provider display info for UI
   */
  getProviderInfo(provider: ProviderType): { name: string; keyUrl: string; placeholder: string } {
    const info: Record<ProviderType, { name: string; keyUrl: string; placeholder: string }> = {
      cursor: {
        name: "Cursor Cloud",
        keyUrl: "https://cursor.com/settings/api-keys",
        placeholder: "Enter Cursor API key",
      },
      openai: {
        name: "OpenAI",
        keyUrl: "https://platform.openai.com/api-keys",
        placeholder: "sk-...",
      },
      openrouter: {
        name: "OpenRouter",
        keyUrl: "https://openrouter.ai/keys",
        placeholder: "sk-or-...",
      },
      replicate: {
        name: "Replicate",
        keyUrl: "https://replicate.com/account/api-tokens",
        placeholder: "r8_...",
      },
    };

    return info[provider];
  }
}
