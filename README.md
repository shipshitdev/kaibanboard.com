# Kaiban Markdown - VS Code Extension

![Status](https://img.shields.io/badge/status-development-orange)
![Version](https://img.shields.io/badge/version-pre--release-red)
![Production](https://img.shields.io/badge/production-not%20ready-red)
![License](https://img.shields.io/github/license/kaiban-md/kaiban-md)

An AI-powered Kanban board for visualizing markdown tasks from `.agent/TASKS/` directories with PRD preview support.

## Features

- **3-Column Board**: To Do, Testing, Done
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
3. Run `bun install`
4. Press `F5` to launch Extension Development Host
5. In the new window, run command: `Kaiban: Show Markdown Board`

### Option 2: Package and Install

```bash
cd kaiban.md
bun install
bunx @vscode/vsce package
code --install-extension kaiban-md-0.1.0.vsix
```

## Getting Started

### Step 1: Create the Folder Structure

In your workspace root, create the `.agent` folder structure:

```bash
mkdir -p .agent/TASKS
mkdir -p .agent/PRDS
```

Or manually create:
- `.agent/TASKS/` - for your task files
- `.agent/PRDS/` - for your Product Requirements Documents (optional but recommended)

### Step 2: Create Your First Task

Create a new file in `.agent/TASKS/` (e.g., `my-first-task.md`) with this template:

```markdown
## Task: My First Task

**ID:** task-001
**Label:** My First Task
**Description:** This is my first task in Kaiban Markdown
**Type:** Feature
**Status:** Backlog
**Priority:** Medium
**Created:** 2025-01-15
**Updated:** 2025-01-15
**PRD:** [Link](../PRDS/my-first-task-prd.md)

---

## Additional Notes

Add any additional details, acceptance criteria, or notes here.
```

**Required Fields:**
- `ID`: Unique identifier (e.g., `task-001`, `feature-auth`)
- `Label`: Task title
- `Type`: One of `Feature`, `Bug`, `Enhancement`, or `Research`
- `Status`: One of `Backlog`, `To Do`, `Testing`, or `Done`
- `Priority`: One of `High`, `Medium`, or `Low`
- `Created` & `Updated`: Dates in `YYYY-MM-DD` format

**Optional Fields:**
- `Description`: Brief task description
- `PRD`: Link to PRD file (relative path from task file)

### Step 3: Create Your First PRD (Optional)

Create a PRD file in `.agent/PRDS/` (e.g., `my-first-task-prd.md`):

```markdown
# My First Task - Product Requirements Document

## Overview
Brief overview of what this feature/task accomplishes.

## Goals
- Goal 1
- Goal 2

## Requirements
1. Requirement 1
2. Requirement 2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Technical Notes
Any technical implementation details...
```

The PRD can be any markdown format - the extension will render it when you click on a task card.

### Step 4: View Your Board

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run: `Kaiban: Show Markdown Board`
3. Your task should appear in the To Do column!

### Step 5: Setting Up Cursor Cloud Agent (Optional)

**Important:** Cursor Cloud Agent requires **Cursor IDE** (not VS Code). Make sure you're using Cursor, not VS Code, for this feature to work.

#### Workflow Overview

The Cursor Cloud Agent workflow allows you to send tasks to Cursor's AI agent, which will:
1. Create a new branch in your repository
2. Implement the task according to the PRD
3. Create a Pull Request with the changes
4. You can review, request changes, or merge the PR

#### Setup Instructions

1. **Get Your Cursor API Key:**
   - Visit [Cursor API Keys](https://cursor.com/settings/api-keys)
   - Sign in to your Cursor account (you must be in Cursor IDE, not VS Code)
   - Create a new API key or copy an existing one

2. **Set Your API Key (Choose one method):**
   
   **Method A: Via Settings Button**
   - Open the Kanban board
   - Click the ⚙️ (Settings) button in the top right
   - Select "Configure AI Providers"
   - Choose "Cursor Cloud" from the list
   - Paste your API key when prompted
   
   **Method B: Via Command Palette**
   - Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
   - Run: `Kaiban: Set API Key`
   - Select "Cursor Cloud" from the provider list
   - Paste your API key when prompted

3. **Configure Repository URL (Auto-detected):**
   - The extension automatically detects your git repository URL from your workspace
   - If auto-detection fails, you can manually set it:
     - Open Settings (`Cmd+,` / `Ctrl+Shift+P`)
     - Search for `kaiban.cursor.repositoryUrl`
     - Enter your GitHub repository URL (e.g., `https://github.com/username/repo`)

4. **Use Cursor Cloud Agent:**
   - Open the Kanban board
   - The ▶ (Play) button will appear on task cards once an API key is configured
   - Click the ▶ button on any task in "To Do", "Doing", or "Testing" status
   - Select "Cursor Cloud Agent" as the provider
   - The agent will create a branch, implement the task, and open a Pull Request
   - You'll receive a notification when the agent completes with a link to the PR

**Note:** 
- The ▶ button only appears if at least one API key is configured
- Cursor Cloud Agent creates branches and Pull Requests in your repository
- Make sure you have the necessary permissions
- You can reject tasks in "Testing" status to send them back to "To Do" with feedback

### Quick Tips

- **Drag & Drop**: Move tasks between columns to update their status
- **Click Card**: Preview the PRD (if linked)
- **Double-click Card**: Open the task file for editing
- **Refresh**: Click the Refresh button to reload tasks

## Usage

### Open Board

- Command Palette: `Kaiban: Show Markdown Board`
- Or use the notification button when extension activates

### Refresh Board

- Click the Refresh button in the board
- Or use command: `Kaiban: Refresh Board`

### Open Task File

- Click any task card to preview PRD
- Double-click any task card to open the task file for editing

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

For detailed development instructions, see [DEVELOPMENT.md](./DEVELOPMENT.md).

### Quick Start

```bash
# Install dependencies
bun install

# Compile TypeScript
bun run compile

# Watch mode (auto-compile on changes)
bun run watch

# Test the extension
# Press F5 in VS Code to launch Extension Development Host
# Or see DEVELOPMENT.md for complete testing workflow
```

### Development Workflow

1. **Start watch mode** (optional, for auto-compilation):
   ```bash
   bun run watch
   ```

2. **Launch Extension Development Host**: Press `F5` in VS Code

3. **Test your changes**:
   - Make changes in `src/`
   - Save (watch mode auto-compiles)
   - Press `Cmd+R` in Extension Development Host to reload
   - Repeat!

See [DEVELOPMENT.md](./DEVELOPMENT.md) for complete testing, debugging, and development guide.

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
