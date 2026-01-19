import { describe, expect, it } from "vitest";
import { generateSimplePRDTemplate } from "./prdGenerator";

describe("generateSimplePRDTemplate", () => {
  it("returns a structured PRD template with title", () => {
    const template = generateSimplePRDTemplate("Sample Feature");

    expect(template).toContain("# Sample Feature - Product Requirements Document");
    expect(template).toContain("## Overview");
    expect(template).toContain("## Goals");
    expect(template).toContain("## Requirements");
    expect(template).toContain("## Acceptance Criteria");
    expect(template).toContain("## Technical Notes");
  });

  it("includes description when provided", () => {
    const template = generateSimplePRDTemplate("Sample Feature", "This is a custom description");

    expect(template).toContain("This is a custom description");
  });

  it("uses default overview when no description provided", () => {
    const template = generateSimplePRDTemplate("Sample Feature");

    expect(template).toContain("Brief overview of Sample Feature.");
  });
});
