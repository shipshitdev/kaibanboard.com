import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { AIProviderAdapter } from "../types/aiProvider";
import { generatePRD, generateSimplePRDTemplate } from "./prdGenerator";
import type { ProviderRegistry } from "./providerRegistry";

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

describe("generatePRD", () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue("openrouter"),
    } as unknown as vscode.WorkspaceConfiguration);
  });

  it("returns adapter output when it already looks like a PRD", async () => {
    const adapter = buildAdapter({
      status: "completed",
      output: "# PRD\n\n## Overview\nDetails",
      model: "gpt-4",
    });
    const registry = buildRegistry(adapter);

    const result = await generatePRD(registry, { title: "New Feature", description: "Desc" });

    expect(result.content).toContain("## Overview");
    expect(result.provider).toBe("openrouter");
    expect(result.model).toBe("gpt-4");
  });

  it("wraps non-PRD output in a template", async () => {
    const adapter = buildAdapter({
      status: "completed",
      output: "Plain text summary",
    });
    const registry = buildRegistry(adapter);

    const result = await generatePRD(registry, { title: "API Upgrade" });

    expect(result.content).toContain("# API Upgrade - Product Requirements Document");
    expect(result.content).toContain("## Generated Content");
  });

  it("uses the provided provider override", async () => {
    const adapter = buildAdapter({
      status: "completed",
      output: "# PRD\n\n## Overview\nDetails",
    });
    const getAdapter = vi.fn().mockReturnValue(adapter);
    const registry = buildRegistry(adapter, true, getAdapter);

    await generatePRD(registry, { title: "Override Provider", provider: "openai" });

    expect(getAdapter).toHaveBeenCalledWith("openai");
  });

  it("throws when provider is missing", async () => {
    const registry = buildRegistry(undefined);

    await expect(generatePRD(registry, { title: "Missing Provider" })).rejects.toThrow(
      "Provider openrouter not available"
    );
  });

  it("throws when provider is not configured", async () => {
    const adapter = buildAdapter({ status: "completed", output: "# PRD\n\n## Overview\nDetails" });
    const registry = buildRegistry(adapter, false);

    await expect(generatePRD(registry, { title: "Unconfigured Provider" })).rejects.toThrow(
      "Provider openrouter is not configured"
    );
  });

  it("throws when adapter returns an error", async () => {
    const adapter = buildAdapter({
      status: "error",
      error: "Bad request",
    });
    const registry = buildRegistry(adapter);

    await expect(generatePRD(registry, { title: "Error Provider" })).rejects.toThrow("Bad request");
  });

  it("throws when generation is still in progress", async () => {
    const adapter = buildAdapter({
      status: "running",
      output: "Working...",
    });
    const registry = buildRegistry(adapter);

    await expect(generatePRD(registry, { title: "Pending PRD" })).rejects.toThrow(
      "Generation is still in progress"
    );
  });
});

describe("generateSimplePRDTemplate", () => {
  it("returns a structured PRD template", () => {
    const template = generateSimplePRDTemplate("Sample Feature", "Short description");

    expect(template).toContain("## Overview");
    expect(template).toContain("## Goals");
    expect(template).toContain("## Requirements");
    expect(template).toContain("## Acceptance Criteria");
    expect(template).toContain("## Technical Notes");
  });
});
