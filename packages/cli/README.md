# @kaibanboard/cli

Interactive terminal kanban board for AI-assisted development.

## Installation

```bash
npm i -g @kaibanboard/cli
```

## Usage

```bash
# Run in current directory
kai

# Run in specific directory
kai /path/to/project

# Show specific columns
kai --columns "Backlog,To Do,Doing,Done"

# Help
kai --help
```

## Features

- Interactive TUI with vim-style navigation (h/j/k/l)
- Execute tasks with Claude CLI, Codex CLI, or Cursor CLI
- Real-time file watching - board updates automatically
- Quick status changes with number keys (1-6)
- Task details view with full metadata

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `h` / `←` | Previous column |
| `l` / `→` | Next column |
| `k` / `↑` | Previous task |
| `j` / `↓` | Next task |
| `Enter` | View task details |
| `e` | Execute task with CLI |
| `1-6` | Quick status change |
| `r` | Refresh board |
| `?` | Show help |
| `q` | Quit |

## Task Format

Reads markdown files from `.agent/TASKS/`:

```markdown
## Task: Implement feature

**ID:** task-1234567890
**Status:** To Do
**Priority:** High
...
```

## Requirements

- Node.js 18+
- `.agent/TASKS/` directory in your project

## Cursor Extension

For a graphical interface, install the Cursor extension:

[Kaiban Board - Cursor Extension](https://marketplace.visualstudio.com/items?itemName=shipshitdev.kaibanboardcom)

## License

MIT
