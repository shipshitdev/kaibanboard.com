/**
 * Kaiban Board CLI - Interactive Terminal UI
 *
 * Usage:
 *   kai                  # Run in current directory
 *   kai /path/to/project # Run in specified directory
 *   kai --help           # Show help
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { TaskStatus } from "@kaibanboard/core";
import { render } from "ink";
import meow from "meow";
import { App } from "./app.js";

const cli = meow(
  `
  Usage
    $ kai [directory]

  Options
    --columns, -c  Columns to display (comma-separated)
                   Default: Backlog,Planning,In Progress,AI Review,Human Review,Done
                   Available: Backlog,Planning,In Progress,AI Review,Human Review,Done,Archived,Blocked

  Examples
    $ kai
    $ kai /path/to/project
    $ kai --columns "Backlog,Planning,In Progress,Done"
`,
  {
    importMeta: import.meta,
    flags: {
      columns: {
        type: "string",
        shortFlag: "c",
        default: "Backlog,Planning,In Progress,AI Review,Human Review,Done",
      },
    },
  }
);

function main() {
  // Determine workspace directory
  const workspaceDir = cli.input[0] ? path.resolve(cli.input[0]) : process.cwd();

  // Validate directory exists
  if (!fs.existsSync(workspaceDir)) {
    console.error(`Error: Directory not found: ${workspaceDir}`);
    process.exit(1);
  }

  // Check for .agent/TASKS directory
  const tasksDir = path.join(workspaceDir, ".agent", "TASKS");
  if (!fs.existsSync(tasksDir)) {
    console.error(`Error: No .agent/TASKS directory found in ${workspaceDir}`);
    console.error("\nMake sure you're in a project with Kaiban tasks.");
    console.error("Create the directory with: mkdir -p .agent/TASKS");
    process.exit(1);
  }

  // Parse columns
  const columns = cli.flags.columns.split(",").map((c) => c.trim()) as TaskStatus[];

  // Validate columns
  const validColumns: TaskStatus[] = [
    "Backlog",
    "Planning",
    "In Progress",
    "AI Review",
    "Human Review",
    "Done",
    "Archived",
    "Blocked",
  ];
  for (const col of columns) {
    if (!validColumns.includes(col)) {
      console.error(`Error: Invalid column "${col}"`);
      console.error(`Valid columns: ${validColumns.join(", ")}`);
      process.exit(1);
    }
  }

  // Render the app
  render(<App workspaceDir={workspaceDir} columns={columns} />);
}

main();
