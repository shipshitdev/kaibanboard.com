<p align="center">
  <img src="assets/icon.png" alt="Kaiban Board Logo" width="128" height="128">
</p>

<h1 align="center">Kaiban Board</h1>

<p align="center">
  <strong>Kanban board for Claude CLI task management</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=shipshitdev.kaibanboardcom">
    <img src="https://img.shields.io/visual-studio-marketplace/v/shipshitdev.kaibanboardcom?style=flat-square&logo=visualstudiocode&logoColor=white&label=VS%20Code" alt="VS Code Marketplace">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=shipshitdev.kaibanboardcom">
    <img src="https://img.shields.io/visual-studio-marketplace/d/shipshitdev.kaibanboardcom?style=flat-square&logo=visualstudiocode&logoColor=white" alt="Downloads">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=shipshitdev.kaibanboardcom">
    <img src="https://img.shields.io/visual-studio-marketplace/r/shipshitdev.kaibanboardcom?style=flat-square&logo=visualstudiocode&logoColor=white" alt="Rating">
  </a>
  <img src="https://img.shields.io/badge/status-production%20ready-brightgreen?style=flat-square" alt="Production Ready">
  <a href="https://github.com/shipshitdev/kaibanboard.com/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/shipshitdev/kaibanboard.com?style=flat-square" alt="License">
  </a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#usage">Usage</a> •
  <a href="#development">Development</a> •
  <a href="CHANGELOG.md">Changelog</a>
</p>

---

<p align="center">
  <img src="assets/screenshot.png" alt="Kaiban Board Screenshot" width="100%">
</p>

---

## Why Kaiban Board?

**Kaiban Board** transforms your markdown task files into a visual kanban board directly inside Cursor IDE. Execute tasks with Claude CLI right from your board.

- **Claude CLI Integration** - Execute tasks directly via Claude Code from the board
- **Markdown-based** - Tasks are simple `.md` files you own and version control
- **Zero lock-in** - Your tasks are just files in your repo, not locked in a database

## Features

| Feature | Description |
|---------|-------------|
| **6-Column Board** | Backlog, To Do, Doing, Testing, Done, Blocked - fully customizable |
| **PRD Preview** | View Product Requirements Documents inline |
| **Multi-Workspace** | Aggregates tasks from all workspace folders |
| **Drag & Drop** | Reorder tasks within columns, order persists to files |
| **Priority Sorting** | Smart sorting by custom order, then by priority |
| **Direct Task Execution** | Execute tasks with Claude Code directly from the kanban board - just click ▶ |
| **Ralph Wiggum Loop** | Optional integration with [ralph-wiggum plugin](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) for autonomous iterative execution |
| **Theme Support** | Adapts to Cursor's dark/light theme |
| **Real-time Refresh** | Board updates when task files change |

## Installation

### From VS Code Marketplace

1. Open VS Code/Cursor
2. Go to Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
3. Search for "Kaiban Board"
4. Click Install

### From VSIX File

```bash
cd kaibanboard.com
bun install
bun run package
code --install-extension build/shipshitdev.kaibanboardcom-*.vsix
```

## Getting Started

### 1. Create the Folder Structure

```bash
mkdir -p .agent/TASKS .agent/PRDS
```

### 2. Create Your First Task

Create `.agent/TASKS/my-first-task.md`:

```markdown
## Task: My First Task

**ID:** task-001
**Label:** My First Task
**Description:** This is my first task in Kaiban Board
**Type:** Feature
**Status:** To Do
**Priority:** Medium
**Created:** 2025-01-15
**Updated:** 2025-01-15
**PRD:** [Link](../PRDS/my-first-task-prd.md)

---

## Additional Notes

Add any additional details here.
```

### 3. Open the Board

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run: `Kaiban: Show Markdown Board`

### Task File Reference

| Field | Required | Values |
|-------|----------|--------|
| **ID** | Yes | Unique identifier (e.g., `task-001`) |
| **Label** | Yes | Task title |
| **Type** | Yes | `Feature`, `Bug`, `Enhancement`, `Research` |
| **Status** | Yes | `Backlog`, `To Do`, `Doing`, `Testing`, `Done`, `Blocked` |
| **Priority** | Yes | `High`, `Medium`, `Low` |
| **Created** | Yes | Date in `YYYY-MM-DD` format |
| **Updated** | Yes | Date in `YYYY-MM-DD` format |
| **Description** | No | Brief task description |
| **PRD** | No | Link to PRD file |
| **Order** | No | Numeric value for custom ordering |

## Usage

### Board Interactions

| Action | Result |
|--------|--------|
| **Click card** | Preview PRD in sidebar |
| **Double-click card** | Open task file for editing |
| **Drag card** | Move between columns or reorder |
| **Click ▶ button** | Execute task via Claude CLI |
| **Click ⏱ button** | Set rate limit timer (pause before retry) |
| **Click ⟳ button** | Refresh board |

### Task Execution

**Execute tasks directly from the kanban board** - no need to open files or run commands manually. Simply click the ▶ button on any task card to start execution.

#### Basic Execution

1. Click ▶ on any task in To Do, Doing, or Testing columns
2. A new terminal opens with Claude Code
3. Claude reads the task file and implements it
4. Task status automatically updates when complete

#### With Ralph Wiggum Loop (Autonomous Iterative Execution)

[Ralph Wiggum](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) is a Claude Code plugin that enables **autonomous, iterative development**. Instead of single-pass execution, Ralph Loop enables Claude to:

- Work iteratively on complex tasks
- Review and validate its own output
- Fix issues and improve implementation in multiple passes
- Continue until completion criteria are met or max iterations reached

**To use Ralph Wiggum Loop:**

1. Install the plugin in Claude Code: `/plugin install ralph-wiggum`
2. Enable in settings: `kaiban.claude.useRalphLoop: true`
3. Click ▶ on any task card in the board
4. Claude will work iteratively, automatically reviewing and improving until the task is complete

Ralph Loop is particularly useful for complex tasks that require multiple steps, testing, and refinement. The extension automatically includes your PRD content for full context.

## Project Structure

```
your-project/
├── .agent/
│   ├── TASKS/
│   │   ├── feature-1.md
│   │   └── bug-fix-1.md
│   └── PRDS/
│       ├── feature-1-prd.md
│       └── bug-fix-1-prd.md
└── src/
    └── ...
```

## Development

```bash
# Install dependencies
bun install

# Watch mode (auto-compile)
bun run watch

# Launch Extension Development Host
# Press F5 in VS Code

# Generate screenshot for README
bun run screenshot

# Package extension
bun run package
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for complete development guide.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `kaiban.columns.enabled` | `["To Do", "Doing", "Testing", "Done"]` | Columns to display |
| `kaiban.task.basePath` | `.agent/TASKS` | Task files location |
| `kaiban.prd.basePath` | `.agent/PRDS` | PRD files location |
| `kaiban.claude.executablePath` | `claude` | Path to Claude CLI |
| `kaiban.claude.useRalphLoop` | `false` | Use Ralph Loop plugin |
| `kaiban.claude.promptTemplate` | `Read the task file at {taskFile}...` | Prompt template |
| `kaiban.claude.executionTimeout` | `30` | Max execution time (minutes) |

## Requirements

- **Cursor IDE** (required) - This extension only works in Cursor
- **Claude Code CLI** - For task execution
- Workspace with `.agent/TASKS/` directory

### Optional

- **[Ralph Wiggum Plugin](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)**: For autonomous iterative task execution with self-review and refinement

## License

MIT

---

<p align="center">
  <a href="https://kaibanboard.com">kaibanboard.com</a> •
  <a href="https://github.com/shipshitdev/kaibanboard.com/issues">Report Bug</a> •
  <a href="https://github.com/shipshitdev/kaibanboard.com/issues">Request Feature</a>
</p>
