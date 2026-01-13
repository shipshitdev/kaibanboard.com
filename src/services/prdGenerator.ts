/**
 * Generate a simple PRD template
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
