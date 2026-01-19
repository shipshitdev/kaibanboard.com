import { describe, expect, it } from "vitest";
import { generateSimpleTaskTemplate } from "./taskGenerator";

describe("generateSimpleTaskTemplate", () => {
  it("returns a task template with required fields", () => {
    const template = generateSimpleTaskTemplate({
      id: "task-001",
      label: "Simple Task",
    });

    expect(template).toContain("## Task: Simple Task");
    expect(template).toContain("**ID:** task-001");
    expect(template).toContain("**Label:** Simple Task");
    expect(template).toContain("## Additional Notes");
  });

  it("uses default values when optional fields not provided", () => {
    const template = generateSimpleTaskTemplate({
      id: "task-001",
      label: "Simple Task",
    });

    expect(template).toContain("**Status:** Backlog");
    expect(template).toContain("**Priority:** Medium");
    expect(template).toContain("**Type:** Feature");
  });

  it("uses provided optional values", () => {
    const template = generateSimpleTaskTemplate({
      id: "task-002",
      label: "Bug Fix",
      description: "Fix the login bug",
      type: "Bug",
      status: "Planning",
      priority: "High",
      prdPath: "../PRDS/auth-prd.md",
    });

    expect(template).toContain("**Type:** Bug");
    expect(template).toContain("**Status:** Planning");
    expect(template).toContain("**Priority:** High");
    expect(template).toContain("**Description:** Fix the login bug");
    expect(template).toContain("**PRD:** [Link](../PRDS/auth-prd.md)");
  });

  it("includes created and updated dates", () => {
    const template = generateSimpleTaskTemplate({
      id: "task-001",
      label: "Simple Task",
    });

    // Should contain ISO date format (YYYY-MM-DD)
    expect(template).toMatch(/\*\*Created:\*\* \d{4}-\d{2}-\d{2}/);
    expect(template).toMatch(/\*\*Updated:\*\* \d{4}-\d{2}-\d{2}/);
  });

  it("handles empty PRD path", () => {
    const template = generateSimpleTaskTemplate({
      id: "task-001",
      label: "No PRD Task",
    });

    expect(template).toContain("**PRD:**");
    expect(template).not.toContain("[Link]");
  });
});
