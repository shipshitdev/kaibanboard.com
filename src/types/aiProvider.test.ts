import { describe, expect, it } from "vitest";
import type { AgentResponse, ModelInfo, StreamChunk, TaskPrompt } from "./aiProvider";
import { BaseProviderAdapter } from "./aiProvider";

class TestAdapter extends BaseProviderAdapter {
  readonly type = "openai" as const;
  readonly displayName = "Test Adapter";
  readonly supportsStreaming = false;
  readonly supportsAgentMode = false;

  async validateApiKey(): Promise<boolean> {
    return true;
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    return [];
  }

  async sendTask(): Promise<AgentResponse> {
    return {
      id: "test",
      status: "completed",
      provider: "openai",
    };
  }
}

describe("BaseProviderAdapter", () => {
  it("composes prompts with optional sections", () => {
    const adapter = new TestAdapter(async () => "key");
    const prompt: TaskPrompt = {
      title: "Test Task",
      description: "Details",
      type: "Feature",
      priority: "High",
      prdContent: "PRD",
      rejectionHistory: "Needs work",
      filePath: "/path/to/task.md",
    };

    const composed = (
      adapter as unknown as { composePrompt: (p: TaskPrompt) => string }
    ).composePrompt(prompt);

    expect(composed).toContain("# Task: Test Task");
    expect(composed).toContain("## Description");
    expect(composed).toContain("## Previous Feedback");
    expect(composed).toContain("## Product Requirements Document");
    expect(composed).toContain("Task is defined in: /path/to/task.md");
  });

  it("omits optional sections when not provided", () => {
    const adapter = new TestAdapter(async () => "key");
    const prompt: TaskPrompt = {
      title: "Test Task",
      description: "",
      type: "Bug",
      priority: "Low",
      filePath: "",
    };

    const composed = (
      adapter as unknown as { composePrompt: (p: TaskPrompt) => string }
    ).composePrompt(prompt);

    expect(composed).not.toContain("## Description");
    expect(composed).not.toContain("## Previous Feedback");
    expect(composed).not.toContain("## Product Requirements Document");
    expect(composed).not.toContain("Task is defined in:");
  });

  it("returns the system prompt guidance", () => {
    const adapter = new TestAdapter(async () => "key");
    const systemPrompt = (
      adapter as unknown as { getSystemPrompt: () => string }
    ).getSystemPrompt();
    expect(systemPrompt).toContain("expert software engineer");
    expect(systemPrompt).toContain("Write clean, maintainable code");
  });

  it("allows StreamChunk typing in tests", () => {
    const chunk: StreamChunk = { type: "text", content: "hello" };
    expect(chunk.content).toBe("hello");
  });
});
