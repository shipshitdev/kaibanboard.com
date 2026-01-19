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
 * Generate a simple task template
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
