# Kaiban Board

Kanban board for AI-assisted development. Execute markdown tasks via Claude Code directly from your board.

## Features

- Visual kanban board for `.agent/TASKS/*.md` files
- Drag-and-drop task management
- Execute tasks with Claude CLI, Codex CLI, or Cursor CLI
- Real-time progress tracking during task execution
- PRD linking and status sync
- Configurable columns (Backlog, To Do, Doing, Testing, Done, Blocked)

## Requirements

- **Cursor IDE** (not compatible with VS Code)
- Claude CLI, Codex CLI, or Cursor CLI installed

## Usage

1. Open Command Palette (`Cmd+Shift+P`)
2. Run "Kaiban: Show Markdown Board"
3. Click on tasks to view details or execute

## Task Format

Tasks are markdown files in `.agent/TASKS/`:

```markdown
## Task: Implement user authentication

**ID:** task-1234567890
**Label:** Implement user authentication
**Description:** Add login and signup flows
**Type:** Feature
**Status:** To Do
**Priority:** High
**Created:** 2024-01-15
**Updated:** 2024-01-15
**PRD:** [Link](../PRDS/auth-feature.md)

---
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `kaiban.cli.defaultProvider` | CLI to use (auto/claude/codex/cursor) | `auto` |
| `kaiban.columns.enabled` | Columns to display | `["To Do", "Doing", "Testing", "Done"]` |
| `kaiban.task.basePath` | Path to task files | `.agent/TASKS` |
| `kaiban.prd.basePath` | Path to PRD files | `.agent/PRDS` |

## Terminal Alternative

Prefer working in the terminal? Install the CLI:

```bash
npm i -g @kaibanboard/cli
kai
```

## License

MIT
