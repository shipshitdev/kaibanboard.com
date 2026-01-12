# Kaiban Board - VS Code Extension

![Project Type](https://img.shields.io/badge/Project-App-blue)
![Status](https://img.shields.io/badge/status-development-orange)
![Version](https://img.shields.io/badge/version-pre--release-red)
![Production](https://img.shields.io/badge/production-not%20ready-red)
![License](https://img.shields.io/github/license/shipshitdev/kaibanboard.com)

An AI-powered Kanban board for visualizing markdown tasks from `.agent/TASKS/` directories with PRD preview support.

## Features

- **3-Column Board**: To Do, Testing, Done
- **PRD Preview**: View Product Requirements Documents inline
- **Multi-Workspace Support**: Aggregates tasks from all workspace folders
- **Smart Parsing**: Reads Kanban markdown format with metadata
- **Task Ordering**: Drag & drop to reorder tasks within columns - order is persisted to task files
- **Smart Sorting**: Tasks sorted by custom order first, then by priority (High → Medium → Low)
- **Click to Preview**: Click any card to preview PRD (no file opening)
- **Double-click to Open**: Double-click to open the task file for editing
- **Priority Badges**: Visual indicators for High/Medium/Low priority
- **Real-time Refresh**: Update board with latest tasks
- **Theme Support**: Adapts to VS Code's theme (dark/light)
- **AI-Enhanced**: Intelligent task organization and visualization
- **Ralph Loop Integration**: Execute tasks with Claude's autonomous development loop (requires Claude Code and ralph-wiggum plugin)

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
**Order:** 1
**Created:** 2025-10-19
**Updated:** 2025-10-19
**PRD:** [Link](../PRDS/file.md)

---

## Additional Notes
```

## Installation

### Option 1: Development Mode

1. Clone the repository to your workspace
2. Open the folder in VS Code
3. Run `bun install`
4. Press `F5` to launch Extension Development Host
5. In the new window, run command: `Kaiban: Show Markdown Board`

### Option 2: Package and Install

```bash
cd kaibanboard.com
bun install
bunx @vscode/vsce package
code --install-extension shipshitdev.kaibanboardcom-0.2.0.vsix
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
**Description:** This is my first task in Kaiban Board
**Type:** Feature
**Status:** Backlog
**Priority:** Medium
**Order:** 1
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
- `Order`: Numeric value for custom task ordering within each column (automatically set when dragging tasks)

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

### Step 6: Using Ralph Loop for Task Execution

**Important:** Ralph Loop requires **Claude Code** (not VS Code). The extension uses Claude Code by default for executing ralph-loop commands.

#### What is Ralph Loop?

Ralph Loop is a Claude Code plugin that enables autonomous, iterative development loops. When you execute a task with Ralph Loop, Claude will:
1. Work on the task iteratively
2. View previous outputs each iteration
3. Continue refining until the task is complete
4. Stop when completion goals are achieved

#### Prerequisites

1. **Install Claude Code**: Make sure you're using Claude Code (not VS Code) for this feature
2. **Install Ralph Loop Plugin**: The Ralph Loop plugin must be installed in Claude Code
   - In Claude Code, run: `/plugin install ralph-wiggum`
   - Or install from the [official Anthropic plugins repository](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop)

#### Using Ralph Loop

1. **Open the Kanban board** and click the ▶ (Play) button on any task card
2. **Select "Execute with Ralph Loop"** in the execution method options
3. **Click "Execute with Ralph"** - The ralph-loop command will be executed in your terminal
4. **Monitor progress** in the terminal - Claude will work on the task iteratively

#### Configuration

You can configure Ralph Loop settings in VS Code/Cursor settings:

- `kaiban.ralph.command`: The ralph command to execute (default: `/ralph-loop`)
- `kaiban.ralph.maxIterations`: Maximum iterations for ralph-loop (default: 5)
- `kaiban.ralph.completionPromise`: Completion promise template (optional)

**Default Command Format:**
```
/ralph-loop "Task: [task-label]

[task-description]

PRD Context:
[prd-content]" --max-iterations 5
```

The command includes:
- Task label and description
- PRD content (if available) for context
- Maximum iterations limit
- Optional completion promise

**Note:**
- Ralph Loop executes in your VS Code/Cursor terminal
- The command uses Claude Code by default
- Task information (label, description, PRD) is automatically included
- You can see the full command output in the terminal panel

### Quick Tips

- **Drag & Drop**: Move tasks between columns to update their status, or within the same column to reorder them
- **Task Ordering**: Tasks are automatically ordered within each column - drag tasks to set custom order (stored as `Order` field)
- **Sorting**: Tasks without an order field are sorted by priority (High → Medium → Low)
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

### Task Ordering

Kaiban Board supports custom task ordering within each column. This feature allows you to prioritize tasks visually and persist that order.

#### How It Works

1. **Drag & Drop**: Simply drag any task card to a new position within the same column
2. **Order Persistence**: The new order is automatically saved to the task file as an `Order` field
3. **Automatic Sorting**: Tasks are displayed in this order:
   - First: Tasks with an `Order` field (sorted ascending: 1, 2, 3...)
   - Then: Tasks without an `Order` field (sorted by priority: High → Medium → Low)
   - Within same order: Falls back to priority sorting

#### Order Field Format

When you drag a task, the extension automatically adds or updates an `Order` field in the task file:

```markdown
**Order:** 1
```

The order field is inserted after the `Priority` field in the task metadata. Each column maintains its own independent ordering.

#### Example

If you have three tasks in the "To Do" column:
- Task A (High priority, no order)
- Task B (Medium priority, Order: 1)
- Task C (Low priority, Order: 2)

The display order will be:
1. Task B (has order 1)
2. Task C (has order 2)
3. Task A (no order, sorted by priority: High comes last after ordered tasks)

**Note**: Tasks with order values always appear before tasks without order values, regardless of priority.

### Create PRD or Task from Cursor Chat

You can trigger PRD and Task creation directly from Cursor's chat interface:

#### Using Command Syntax

In Cursor chat, type:
- `@kaiban.createPRD` to create a new PRD
- `@kaiban.createTask` to create a new Task

**Example:**
```
@kaiban.createPRD
```

After running the command, you'll be prompted for:
1. PRD/Task title (required)
2. Description (optional)
3. Additional fields (for tasks: type, priority, status)
4. Whether to use AI generation (if AI providers are configured)

#### Using Command Palette

You can also use the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):
- `Kaiban: Create PRD` - Create a new PRD file with AI assistance
- `Kaiban: Create Task` - Create a new Task file with AI assistance

#### AI-Assisted Generation

When creating a PRD or Task, if you have AI providers configured (OpenAI, OpenRouter, etc.), you'll be asked if you want to use AI to generate the content:
- **Yes**: AI will generate comprehensive content based on your title and description
- **No**: Creates a template file that you can fill in manually

**Note**: AI generation requires at least one configured AI provider. See [Step 5: Setting Up Cursor Cloud Agent](#step-5-setting-up-cursor-cloud-agent-optional) for setup instructions.

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
**Order:** 1
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

- VS Code 1.80.0 or higher (or Claude Code for Ralph Loop feature)
- Workspace must contain `.agent/TASKS/` directories
- Task files must follow the Kanban markdown format
- PRD files should be in `.agent/PRDS/` (optional but recommended)

### Optional Requirements

- **Ralph Loop**: Requires Claude Code and the `ralph-wiggum` plugin installed
  - Install plugin: `/plugin install ralph-wiggum` in Claude Code
  - See [Step 6: Using Ralph Loop](#step-6-using-ralph-loop-for-task-execution) for details
- **Cursor Cloud Agent**: Requires Cursor IDE (not VS Code) and Cursor API key
  - See [Step 5: Setting Up Cursor Cloud Agent](#step-5-setting-up-cursor-cloud-agent-optional) for details

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

## About Kaiban Board

**Kaiban Board** combines:

- **AI** - Intelligent task management
- **Kanban** - Visual workflow organization
- **Markdown** - Simple, readable task format

Perfect for developers who want AI-enhanced task visualization in their markdown-based workflows.

## License

MIT

## Website

Visit us at **[kaibanboard.com](https://kaibanboard.com)**
