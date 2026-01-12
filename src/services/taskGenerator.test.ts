import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { AIProviderAdapter } from "../types/aiProvider";
import type { ProviderRegistry } from "./providerRegistry";
import { generateSimpleTaskTemplate, generateTask } from "./taskGenerator";

const buildRegistry = (
  adapter: AIProviderAdapter | undefined,
  available = true,
  getAdapterMock?: ReturnType<typeof vi.fn>
): ProviderRegistry => {
  const getAdapter = getAdapterMock ?? vi.fn().mockReturnValue(adapter);
  return {
    getAdapter,
    isProviderAvailable: vi.fn().mockResolvedValue(available),
  } as unknown as ProviderRegistry;
};

const buildAdapter = (response: {
  status: "completed" | "error" | "running";
  output?: string;
  model?: string;
  error?: string;
}): AIProviderAdapter =>
  ({
    sendTask: vi.fn().mockResolvedValue(response),
  }) as unknown as AIProviderAdapter;

describe("generateTask", () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue("openrouter"),
    } as unknown as vscode.WorkspaceConfiguration);
  });

  it("builds task content using adapter output", async () => {
    const adapter = buildAdapter({
      status: "completed",
      output: "Generated description",
      model: "gpt-4",
    });
    const registry = buildRegistry(adapter);

    const result = await generateTask(registry, {
      title: "Build Feature",
      description: "Initial description",
      prdPath: "../PRDS/feature.md",
      type: "Feature",
      status: "Backlog",
      priority: "High",
    });

    expect(result.id).toMatch(/^build-feature-/);
    expect(result.description).toBe("Generated description");
    expect(result.content).toContain("## Task: Build Feature");
    expect(result.content).toContain("**PRD:** [Link](../PRDS/feature.md)");
    expect(result.content).toContain("**Priority:** High");
    expect(result.provider).toBe("openrouter");
    expect(result.model).toBe("gpt-4");
  });

  it("uses the provided provider override", async () => {
    const adapter = buildAdapter({
      status: "completed",
      output: "Generated description",
    });
    const getAdapter = vi.fn().mockReturnValue(adapter);
    const registry = buildRegistry(adapter, true, getAdapter);

    await generateTask(registry, { title: "Override Provider", provider: "openai" });

    expect(getAdapter).toHaveBeenCalledWith("openai");
  });

  it("throws when provider is missing", async () => {
    const registry = buildRegistry(undefined);

    await expect(generateTask(registry, { title: "Missing Provider" })).rejects.toThrow(
      "Provider openrouter not available"
    );
  });

  it("throws when provider is not configured", async () => {
    const adapter = buildAdapter({ status: "completed", output: "Generated description" });
    const registry = buildRegistry(adapter, false);

    await expect(generateTask(registry, { title: "Unconfigured Provider" })).rejects.toThrow(
      "Provider openrouter is not configured"
    );
  });

  it("throws when adapter returns an error", async () => {
    const adapter = buildAdapter({
      status: "error",
      error: "Bad request",
    });
    const registry = buildRegistry(adapter);

    await expect(generateTask(registry, { title: "Error Task" })).rejects.toThrow("Bad request");
  });

  it("throws when generation is still in progress", async () => {
    const adapter = buildAdapter({
      status: "running",
      output: "Working...",
    });
    const registry = buildRegistry(adapter);

    await expect(generateTask(registry, { title: "Pending Task" })).rejects.toThrow(
      "Generation is still in progress"
    );
  });
});

describe("generateSimpleTaskTemplate", () => {
  it("returns a task template with defaults", () => {
    const template = generateSimpleTaskTemplate({
      id: "task-001",
      label: "Simple Task",
    });

    expect(template).toContain("## Task: Simple Task");
    expect(template).toContain("**Status:** Backlog");
    expect(template).toContain("**Priority:** Medium");
    expect(template).toContain("## Additional Notes");
  });
});
