import type { AIProviderAdapter } from "../types/aiProvider";
import type { ProviderRegistry } from "./providerRegistry";

export interface TaskGenerationOptions {
  title: string;
  description?: string;
  type?: "Feature" | "Bug" | "Enhancement" | "Research";
  priority?: "High" | "Medium" | "Low";
  status?: "Backlog" | "To Do" | "Doing" | "Testing" | "Done" | "Blocked";
  prdPath?: string;
  provider?: string;
  model?: string;
}

export interface GeneratedTask {
  id: string;
  label: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  content: string;
  provider: string;
  model?: string;
}

/**
 * Generate task content using AI
 */
export async function generateTask(
  registry: ProviderRegistry,
  options: TaskGenerationOptions
): Promise<GeneratedTask> {
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

  // Generate task ID
  const taskId = generateTaskId(options.title);

  // Build the prompt
  const prompt = buildTaskPrompt(options.title, options.description || "");

  // Generate using the adapter
  const response = await generateTextFromAdapter(adapter, prompt, {
    model: options.model,
    maxTokens: 2048,
    temperature: 0.7,
  });

  if (response.status === "error") {
    throw new Error(response.error || "Failed to generate task");
  }

  // Extract generated content
  const generatedDescription = response.output || options.description || "";

  // Create the full task content
  const now = new Date().toISOString().split("T")[0];
  const prdLink = options.prdPath ? `[Link](${options.prdPath})` : "";

  const taskContent = formatTaskTemplate({
    id: taskId,
    label: options.title,
    description: generatedDescription,
    type: options.type || "Feature",
    status: options.status || "Backlog",
    priority: options.priority || "Medium",
    created: now,
    updated: now,
    prdPath: prdLink,
  });

  return {
    id: taskId,
    label: options.title,
    description: generatedDescription,
    type: options.type || "Feature",
    priority: options.priority || "Medium",
    status: options.status || "Backlog",
    content: taskContent,
    provider: providerType,
    model: response.model,
  };
}

/**
 * Generate a task ID from title
 */
function generateTaskId(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Add timestamp for uniqueness
  const timestamp = Date.now().toString(36).slice(-6);
  return `${slug}-${timestamp}`;
}

/**
 * Build a prompt for task generation
 */
function buildTaskPrompt(title: string, description: string): string {
  const parts: string[] = [];

  parts.push(`Generate a detailed task description for the following:`);
  parts.push("");
  parts.push(`**Title:** ${title}`);

  if (description) {
    parts.push(`**Initial Description:** ${description}`);
  }

  parts.push("");
  parts.push("Provide a clear, comprehensive description that includes:");
  parts.push("- What needs to be done");
  parts.push("- Why it's important");
  parts.push("- Key requirements or considerations");
  parts.push("- Any acceptance criteria if applicable");
  parts.push("");
  parts.push("Keep the description concise but informative, suitable for a development task.");

  return parts.join("\n");
}

/**
 * Generate text using an adapter's underlying API
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
  const taskSystemPrompt = `You are a project manager expert at creating clear, actionable development task descriptions.

When generating a task description, make it:
- Clear and specific about what needs to be done
- Concise but comprehensive
- Actionable for developers
- Include acceptance criteria when relevant

Keep descriptions professional and focused.`;

  // Use sendTask with task-specific prompt in description
  const response = await adapter.sendTask(
    {
      title: "Task Generation",
      description: `${taskSystemPrompt}\n\n${prompt}`,
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
 * Format task content into the expected markdown format
 */
function formatTaskTemplate(params: {
  id: string;
  label: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  created: string;
  updated: string;
  prdPath: string;
}): string {
  const lines: string[] = [];

  lines.push(`## Task: ${params.label}`);
  lines.push("");
  lines.push(`**ID:** ${params.id}`);
  lines.push(`**Label:** ${params.label}`);
  lines.push(`**Description:** ${params.description}`);
  lines.push(`**Type:** ${params.type}`);
  lines.push(`**Status:** ${params.status}`);
  lines.push(`**Priority:** ${params.priority}`);
  lines.push(`**Created:** ${params.created}`);
  lines.push(`**Updated:** ${params.updated}`);

  if (params.prdPath) {
    lines.push(`**PRD:** ${params.prdPath}`);
  } else {
    lines.push(`**PRD:**`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Additional Notes");
  lines.push("");
  lines.push("Add any additional details, acceptance criteria, or notes here.");

  return lines.join("\n");
}

/**
 * Generate a simple task template (fallback if AI generation fails)
 */
export function generateSimpleTaskTemplate(params: {
  id: string;
  label: string;
  description?: string;
  type?: string;
  status?: string;
  priority?: string;
  prdPath?: string;
}): string {
  const now = new Date().toISOString().split("T")[0];
  const prdLink = params.prdPath ? `[Link](${params.prdPath})` : "";

  return formatTaskTemplate({
    id: params.id,
    label: params.label,
    description: params.description || `Task: ${params.label}`,
    type: params.type || "Feature",
    status: params.status || "Backlog",
    priority: params.priority || "Medium",
    created: now,
    updated: now,
    prdPath: prdLink,
  });
}
