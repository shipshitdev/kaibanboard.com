# Kaiban Markdown - VS Code Extension

An AI-powered Kanban board for visualizing markdown tasks from `.agent/TASKS/` directories with PRD preview support.

## Features

- **4-Column Board**: Backlog, To Do, Testing, Done
- **PRD Preview**: View Product Requirements Documents inline
- **Multi-Workspace Support**: Aggregates tasks from all workspace folders
- **Smart Parsing**: Reads Kanban markdown format with metadata
- **Click to Preview**: Click any card to preview PRD (no file opening)
- **Double-click to Open**: Double-click to open the task file for editing
- **Priority Badges**: Visual indicators for High/Medium/Low priority
- **Real-time Refresh**: Update board with latest tasks
- **Theme Support**: Adapts to VS Code's theme (dark/light)
- **AI-Enhanced**: Intelligent task organization and visualization

## Supported Format

The extension reads task files in this format:

```markdown
## Task: Title

**ID:** task-id
**Label:** Title
**Description:** Brief description of the task
**Type:** Feature
**Status:** Backlog
**Priority:** High
**Created:** 2025-10-19
**Updated:** 2025-10-19
**PRD:** [Link](../PRDS/file.md)

---

## Additional Notes
```

## Installation

### Option 1: Development Mode

1. Copy the `kaiban.md` folder to your workspace
2. Open it in VS Code
3. Run `npm install`
4. Press `F5` to launch Extension Development Host
5. In the new window, run command: `Kaiban: Show Markdown Board`

### Option 2: Package and Install

```bash
cd kaiban.md
npm install
npm install -g @vscode/vsce
vsce package
code --install-extension kaiban-md-0.1.0.vsix
```

## Usage

### Open Board

- Command Palette: `Kaiban: Show Markdown Board`
- Or use the notification button when extension activates

### Refresh Board

- Click the Refresh button in the board
- Or use command: `Kaiban: Refresh Board`

### Open Task File

- Click any task card to open its source file

## .agent/TASKS|PRDS Architecture

This extension is designed to work with the **classic .agent/TASKS|PRDS architecture** that many AI agents and development workflows use:

### Directory Structure

```
your-project/
├── .agent/
│   ├── TASKS/
│   │   ├── feature-1.md
│   │   ├── feature-2.md
│   │   └── bug-fix-1.md
│   └── PRDS/
│       ├── feature-1-prd.md
│       ├── feature-2-prd.md
│       └── bug-fix-1-prd.md
└── src/
    └── ...
```

### Why This Architecture?

- **AI Agent Compatible**: Most AI agents expect this structure
- **Universal Standard**: Works across different tools and workflows
- **Separation of Concerns**: Tasks and PRDs are clearly separated
- **Scalable**: Easy to organize large numbers of tasks and documents

### Task File Format

Each task file in `.agent/TASKS/` should follow this format:

```markdown
## Task: Your Task Title

**ID:** unique-task-id
**Label:** Your Task Title
**Description:** Brief description of the task
**Type:** Feature|Bug|Enhancement|Research
**Status:** Backlog|To Do|Testing|Done
**Priority:** High|Medium|Low
**Created:** 2025-01-01
**Updated:** 2025-01-01
**PRD:** [Link](../PRDS/your-prd-file.md)

---

## Additional Notes

Your task details here...
```

### PRD File Format

PRD files in `.agent/PRDS/` can be any markdown format. The extension will render them in the preview panel.

## Requirements

- VS Code 1.80.0 or higher
- Workspace must contain `.agent/TASKS/` directories
- Task files must follow the Kanban markdown format
- PRD files should be in `.agent/PRDS/` (optional but recommended)

## Structure

The extension scans for:

- `.agent/TASKS/**/*.md` files (excluding README.md)
- `.agent/PRDS/**/*.md` files for PRD previews
- Recursively across all workspace folders
- Parses structured metadata from task files

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Test in Extension Development Host
Press F5 in VS Code
```

## About Kaiban Markdown

**Kaiban Markdown** combines:

- **AI** - Intelligent task management
- **Kanban** - Visual workflow organization
- **Markdown** - Simple, readable task format

Perfect for developers who want AI-enhanced task visualization in their markdown-based workflows.

## License

MIT

## Website

Visit us at **kaiban.md** (coming soon!)
