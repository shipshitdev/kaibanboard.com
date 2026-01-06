import type { AIProviderAdapter } from "../types/aiProvider";
import type { ProviderRegistry } from "./providerRegistry";

export interface PRDGenerationOptions {
  title: string;
  description?: string;
  provider?: string;
  model?: string;
}

export interface GeneratedPRD {
  content: string;
  provider: string;
  model?: string;
}

/**
 * Generate PRD content using AI
 */
export async function generatePRD(
  registry: ProviderRegistry,
  options: PRDGenerationOptions
): Promise<GeneratedPRD> {
  // Get default provider from config
  const config = (await import("vscode")).workspace.getConfiguration("kaiban.ai");
  const defaultProvider = config.get<string>("defaultProvider", "openrouter") as
    | "cursor"
    | "openai"
    | "openrouter"
    | "replicate";

  // Use provided provider or fall back to default
  const providerType = (options.provider || defaultProvider) as
    | "cursor"
    | "openai"
    | "openrouter"
    | "replicate";

  const adapter = registry.getAdapter(providerType);

  if (!adapter) {
    throw new Error(`Provider ${providerType} not available`);
  }

  // Check if provider is configured
  const isAvailable = await registry.isProviderAvailable(providerType);
  if (!isAvailable) {
    throw new Error(`Provider ${providerType} is not configured. Please set up an API key.`);
  }

  // For PRD generation, we need to call the API directly with a custom prompt
  // Since adapters use sendTask which is designed for task implementation,
  // we'll need to make a direct API call for text generation
  // Let's use a wrapper that calls the adapter's underlying API
  const response = await generateTextFromAdapter(
    adapter,
    buildPRDPrompt(options.title, options.description),
    {
      model: options.model,
      maxTokens: 4096,
      temperature: 0.7,
    }
  );

  if (response.status === "error") {
    throw new Error(response.error || "Failed to generate PRD");
  }

  // Extract generated content
  let content = response.output || "";

  // If the response doesn't look like a PRD, wrap it in a template
  if (!content.includes("#") || !content.includes("Overview")) {
    content = formatPRDTemplate(options.title, options.description || "", content);
  }

  return {
    content,
    provider: providerType,
    model: response.model,
  };
}

/**
 * Build a prompt for PRD generation
 */
function buildPRDPrompt(title: string, description?: string): string {
  const parts: string[] = [];

  parts.push(`Generate a comprehensive Product Requirements Document (PRD) for the following:`);
  parts.push("");
  parts.push(`**Title:** ${title}`);

  if (description) {
    parts.push(`**Description:** ${description}`);
  }

  parts.push("");
  parts.push("The PRD should include:");
  parts.push("- Overview: Brief summary of the feature/product");
  parts.push("- Goals: Key objectives and outcomes");
  parts.push("- Requirements: Detailed functional requirements");
  parts.push("- Acceptance Criteria: Testable criteria for completion");
  parts.push("- Technical Notes: Implementation considerations (if applicable)");
  parts.push("");
  parts.push("Format the output as a markdown document with clear sections.");

  return parts.join("\n");
}

/**
 * Generate text using an adapter's underlying API
 * This is a simplified version that works with OpenAI-compatible APIs
 * For PRD generation, we override the system prompt
 */
async function generateTextFromAdapter(
  adapter: AIProviderAdapter,
  prompt: string,
  options: { model?: string; maxTokens?: number; temperature?: number }
): Promise<{
  output?: string;
  model?: string;
  status: "completed" | "error";
  error?: string;
  id?: string;
}> {
  // For PRD generation, we need to customize the prompt
  // Since adapters use sendTask with a specific format, we'll encode the PRD prompt
  // in the description and use a custom system message approach
  const prdSystemPrompt = `You are a product manager expert at creating comprehensive Product Requirements Documents (PRDs).

When generating a PRD, include:
- Overview: Brief summary of the feature/product
- Goals: Key objectives and outcomes
- Requirements: Detailed functional requirements
- Acceptance Criteria: Testable criteria for completion
- Technical Notes: Implementation considerations (if applicable)

Format your response as clean markdown with proper headings and structure.`;

  // Use sendTask with PRD-specific prompt in description
  const response = await adapter.sendTask(
    {
      title: "PRD Generation",
      description: `${prdSystemPrompt}\n\n${prompt}`,
      type: "Feature",
      priority: "Medium",
      filePath: "",
    },
    {
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    }
  );

  // Convert AgentResponse to our expected format
  if (response.status === "completed" || response.status === "error") {
    return {
      output: response.output,
      model: response.model,
      status: response.status,
      error: response.error,
      id: response.id,
    };
  }

  // Handle pending/running states
  return {
    output: response.output,
    model: response.model,
    status: "error" as const,
    error: "Generation is still in progress",
    id: response.id,
  };
}

/**
 * Format generated content into a proper PRD template if needed
 */
function formatPRDTemplate(title: string, description: string, generatedContent: string): string {
  const lines: string[] = [];

  lines.push(`# ${title} - Product Requirements Document`);
  lines.push("");

  if (description) {
    lines.push("## Overview");
    lines.push(description);
    lines.push("");
  }

  lines.push("## Generated Content");
  lines.push("");
  lines.push(generatedContent);

  return lines.join("\n");
}

/**
 * Generate a simple PRD template (fallback if AI generation fails)
 */
export function generateSimplePRDTemplate(title: string, description?: string): string {
  const lines: string[] = [];

  lines.push(`# ${title} - Product Requirements Document`);
  lines.push("");

  lines.push("## Overview");
  if (description) {
    lines.push(description);
  } else {
    lines.push(`Brief overview of ${title}.`);
  }
  lines.push("");

  lines.push("## Goals");
  lines.push("- Goal 1");
  lines.push("- Goal 2");
  lines.push("");

  lines.push("## Requirements");
  lines.push("1. Requirement 1");
  lines.push("2. Requirement 2");
  lines.push("");

  lines.push("## Acceptance Criteria");
  lines.push("- [ ] Criterion 1");
  lines.push("- [ ] Criterion 2");
  lines.push("");

  lines.push("## Technical Notes");
  lines.push("Any technical implementation details...");

  return lines.join("\n");
}
