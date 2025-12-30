/**
 * Provider Registry
 * Central registry for AI provider adapters
 */

import type { ApiKeyManager } from "../config/apiKeyManager";
import type { AIProviderAdapter, ProviderConfig, ProviderType } from "../types/aiProvider";

export class ProviderRegistry {
  private adapters: Map<ProviderType, AIProviderAdapter> = new Map();

  constructor(private readonly apiKeyManager: ApiKeyManager) {}

  /**
   * Register an adapter for a provider
   */
  registerAdapter(adapter: AIProviderAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  /**
   * Get an adapter by provider type
   */
  getAdapter(type: ProviderType): AIProviderAdapter | undefined {
    return this.adapters.get(type);
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): AIProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get adapters that have API keys configured
   */
  async getEnabledAdapters(): Promise<AIProviderAdapter[]> {
    const configuredProviders = await this.apiKeyManager.getAllConfiguredProviders();
    return configuredProviders
      .map((type) => this.adapters.get(type))
      .filter((adapter): adapter is AIProviderAdapter => adapter !== undefined);
  }

  /**
   * Get provider configurations for all registered providers
   */
  async getAvailableProviders(): Promise<ProviderConfig[]> {
    const configs: ProviderConfig[] = [];

    for (const adapter of this.adapters.values()) {
      const hasKey = await this.apiKeyManager.hasApiKey(adapter.type);
      configs.push({
        id: adapter.type,
        type: adapter.type,
        name: adapter.displayName,
        enabled: hasKey,
      });
    }

    return configs;
  }

  /**
   * Check if a provider is available (has API key configured)
   */
  async isProviderAvailable(type: ProviderType): Promise<boolean> {
    const adapter = this.adapters.get(type);
    if (!adapter) return false;
    return this.apiKeyManager.hasApiKey(type);
  }

  /**
   * Get provider info including available models
   */
  async getProviderWithModels(type: ProviderType): Promise<{
    adapter: AIProviderAdapter;
    models: Awaited<ReturnType<AIProviderAdapter["getAvailableModels"]>>;
  } | null> {
    const adapter = this.adapters.get(type);
    if (!adapter) return null;

    const hasKey = await this.apiKeyManager.hasApiKey(type);
    if (!hasKey) return null;

    const models = await adapter.getAvailableModels();
    return { adapter, models };
  }
}
