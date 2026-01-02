# Architecture - Kaiban Markdown

**Purpose:** Document what IS implemented (not what WILL BE).
**Last Updated:** 2025-01-27

---

## Overview

Kaiban Markdown is a VS Code extension (Cursor IDE required) that provides an AI-powered Kanban board for visualizing markdown tasks from `.agent/TASKS/` directories. The extension parses structured markdown task files, displays them in a Kanban board interface, and integrates with multiple AI providers (Cursor Cloud, OpenAI, OpenRouter, Replicate) to enable AI agents to work on tasks.

The extension uses a webview-based UI rendered in a VS Code panel, with bidirectional communication between the webview and the extension host. Tasks are stored as markdown files in `.agent/TASKS/` directories, and PRDs (Product Requirements Documents) are linked from `.agent/PRDS/` directories.

---

## Tech Stack

- **Language:** TypeScript 5.9.3
- **Runtime:** Node.js (VS Code Extension Host)
- **Framework:** VS Code Extension API
- **UI:** Webview (HTML/CSS/JavaScript) with React-like patterns
- **Testing:** Vitest 4.0.16
- **Linting/Formatting:** Biome 2.3.10
- **Package Manager:** Bun
- **Icons:** Lucide 0.562.0

---

## Project Structure

```
kaibanmd/
├── src/
│   ├── extension.ts              # Extension entry point, command registration
│   ├── kanbanView.ts              # Main Kanban view provider (webview management)
│   ├── taskParser.ts              # Task file parsing and status updates
│   ├── config/
│   │   └── apiKeyManager.ts       # Secure API key storage via VS Code SecretStorage
│   ├── adapters/                  # AI provider adapters
│   │   ├── cursorCloudAdapter.ts  # Cursor Cloud Agent integration
│   │   ├── openaiAdapter.ts        # OpenAI API integration
│   │   ├── openrouterAdapter.ts   # OpenRouter API integration
│   │   └── replicateAdapter.ts    # Replicate API integration
│   ├── services/
│   │   └── providerRegistry.ts    # Central registry for AI providers
│   ├── types/
│   │   └── aiProvider.ts           # Type definitions for AI providers
│   ├── utils/
│   │   └── lucideIcons.ts         # Icon mapping utilities
│   └── test/
│       └── setup.ts                # Test setup with VS Code API mocks
├── out/                            # Compiled JavaScript (from TypeScript)
├── build/                          # Packaged VSIX files
├── package.json                    # Extension manifest and dependencies
├── tsconfig.json                   # TypeScript configuration
└── vitest.config.ts                # Test configuration
```

---

## Key Components

### Extension Entry Point (`extension.ts`)

**Purpose:** Initialize extension, register commands, check for Cursor IDE requirement
**Location:** `src/extension.ts`
**Dependencies:** VS Code API, ApiKeyManager, KanbanViewProvider

**Key Responsibilities:**
- Validates that extension is running in Cursor IDE (not VS Code)
- Initializes ApiKeyManager with VS Code SecretStorage
- Creates KanbanViewProvider instance
- Registers commands: showBoard, refreshBoard, configureProviders, setApiKey, clearApiKey, configurePRDPath
- Shows welcome message on activation

### Kanban View Provider (`kanbanView.ts`)

**Purpose:** Manages webview panel, handles task parsing, coordinates AI provider interactions
**Location:** `src/kanbanView.ts`
**Dependencies:** TaskParser, ProviderRegistry, VS Code API, AI adapters

**Key Responsibilities:**
- Creates and manages webview panel lifecycle
- Handles bidirectional message passing with webview
- Parses tasks from `.agent/TASKS/` directories
- Renders Kanban board HTML/CSS/JS
- Manages task status updates (drag & drop)
- Coordinates AI provider task execution
- Handles PRD preview loading
- Polls for agent status updates

### Task Parser (`taskParser.ts`)

**Purpose:** Parse markdown task files, update task status, manage task metadata
**Location:** `src/taskParser.ts`
**Dependencies:** Node.js fs, path modules, VS Code workspace API

**Key Responsibilities:**
- Recursively scans `.agent/TASKS/` directories for `.md` files
- Parses structured markdown format with metadata fields
- Updates task status in markdown files
- Syncs PRD file status when task status changes
- Handles task rejection workflow
- Writes task files in structured format

**Task File Format:**
```markdown
## Task: Title

**ID:** task-id
**Label:** Title
**Description:** Description
**Type:** Feature|Bug|Enhancement|Research
**Status:** Backlog|To Do|Doing|Testing|Done|Blocked
**Priority:** High|Medium|Low
**Created:** YYYY-MM-DD
**Updated:** YYYY-MM-DD
**PRD:** [Link](../PRDS/file.md)
**Claimed-By:** agent-name
**Claimed-At:** ISO timestamp
**Completed-At:** ISO timestamp
**Rejection-Count:** number
**Agent-Notes:** multi-line notes

---
```

### API Key Manager (`config/apiKeyManager.ts`)

**Purpose:** Secure storage and retrieval of API keys using VS Code SecretStorage
**Location:** `src/config/apiKeyManager.ts`
**Dependencies:** VS Code SecretStorage API

**Key Responsibilities:**
- Stores API keys securely (encrypted by VS Code)
- Validates API key formats per provider
- Provides provider information (name, URL, placeholder)
- Lists configured providers
- Manages API key lifecycle (get, set, delete)

### Provider Registry (`services/providerRegistry.ts`)

**Purpose:** Central registry for AI provider adapters
**Location:** `src/services/providerRegistry.ts`
**Dependencies:** ApiKeyManager, AI provider adapters

**Key Responsibilities:**
- Registers AI provider adapters
- Retrieves adapters by provider type
- Filters adapters by API key availability
- Provides provider configurations for UI

### AI Provider Adapters (`adapters/*.ts`)

**Purpose:** Unified interface for different AI providers
**Location:** `src/adapters/`
**Dependencies:** Provider-specific APIs, ApiKeyManager

**Supported Providers:**
- **Cursor Cloud Agent** (`cursorCloudAdapter.ts`): Full agent workflow with branch/PR creation
- **OpenAI** (`openaiAdapter.ts`): Direct OpenAI API integration
- **OpenRouter** (`openrouterAdapter.ts`): Unified access to multiple models
- **Replicate** (`replicateAdapter.ts`): Replicate API integration

**Common Interface:**
- `validateApiKey()`: Validate API key format
- `getAvailableModels()`: List available models
- `sendTask()`: Send task to AI provider
- `streamTask()`: Stream responses (optional)
- `checkStatus()`: Check async task status (optional)

---

## Data Flow

### Task Loading Flow

```
1. User opens Kanban board (kaiban.showBoard command)
   |
2. KanbanViewProvider.show() creates webview panel
   |
3. TaskParser.parseTasks() scans .agent/TASKS/ directories
   |
4. For each .md file:
   - Read file content
   - Parse structured markdown format
   - Extract metadata (ID, status, priority, etc.)
   - Create Task object
   |
5. Group tasks by status
   |
6. Render HTML with task data
   |
7. Send HTML to webview panel
```

### Task Status Update Flow

```
1. User drags task card to new column (webview)
   |
2. Webview sends message: { command: "updateStatus", taskId, newStatus }
   |
3. KanbanViewProvider receives message
   |
4. TaskParser.updateTaskStatus() called
   |
5. Read task file from disk
   |
6. Update Status and Updated fields
   |
7. Write updated content back to file
   |
8. If PRD exists, update PRD status
   |
9. Refresh board to show updated status
```

### AI Agent Task Execution Flow

```
1. User clicks "Play" button on task card
   |
2. Webview sends message: { command: "sendToAgent", taskId, provider }
   |
3. KanbanViewProvider receives message
   |
4. Load task data and PRD content
   |
5. Get adapter from ProviderRegistry
   |
6. Compose prompt from task + PRD
   |
7. Call adapter.sendTask()
   |
8. For Cursor Cloud:
   - Create branch via git
   - Send to Cursor API
   - Poll for status
   - Create PR when complete
   |
9. Update task file with agent metadata
   |
10. Poll for completion status
   |
11. Update UI with agent status
```

---

## External Services

| Service | Purpose | Documentation | Authentication |
|---------|---------|---------------|---------------|
| Cursor Cloud Agent API | Full agent workflow with branch/PR creation | https://api.cursor.com/v0 | API key (Basic Auth) |
| OpenAI API | Direct model access | https://platform.openai.com/docs | API key (Bearer token) |
| OpenRouter API | Unified access to multiple AI models | https://openrouter.ai/docs | API key (Bearer token) |
| Replicate API | Model inference | https://replicate.com/docs | API token (Bearer token) |
| GitHub API | PR creation (via Cursor Cloud) | https://docs.github.com/en/rest | OAuth via Cursor |

**API Key Storage:**
- All API keys stored in VS Code SecretStorage (encrypted)
- Keys prefixed with `kaiban.apiKey.{provider}`
- Never logged or exposed in plaintext

---

## Configuration

### VS Code Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `kaiban.columns.enabled` | `["To Do", "Doing", "Testing", "Done"]` | Which columns to display |
| `kaiban.prd.basePath` | `.agent/PRDS` | Base path for PRD files |
| `kaiban.ai.defaultProvider` | `openrouter` | Default AI provider |
| `kaiban.ai.defaultModel` | `""` | Default model (provider-specific) |
| `kaiban.ai.streamResponses` | `true` | Stream AI responses when supported |
| `kaiban.cursor.repositoryUrl` | `""` | GitHub repo URL (auto-detected) |
| `kaiban.cursor.autoCreatePr` | `true` | Auto-create PR when agent completes |

### Environment Variables

None required - all configuration via VS Code settings and API keys via SecretStorage.

---

## Deployment

### Development

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Compile TypeScript:**
   ```bash
   bun run compile
   # or watch mode
   bun run watch
   ```

3. **Launch Extension Development Host:**
   - Press `F5` in VS Code/Cursor
   - New window opens with extension loaded

4. **Test:**
   ```bash
   bun test
   ```

### Packaging

1. **Build VSIX:**
   ```bash
   bun run package
   ```

2. **Output:** `build/kaiban-md-{version}.vsix`

3. **Install:**
   ```bash
   code --install-extension build/kaiban-md-{version}.vsix
   ```

### Publishing

1. **Install vsce:**
   ```bash
   bunx @vscode/vsce package
   ```

2. **Publish to Marketplace:**
   ```bash
   bunx @vscode/vsce publish
   ```

**Requirements:**
- Extension requires Cursor IDE (not compatible with VS Code)
- Workspace must contain `.agent/TASKS/` directories
- Task files must follow structured markdown format

---

## Security

See `quality/SECURITY-CHECKLIST.md` for security considerations.

**Key Security Features:**
- API keys stored in VS Code SecretStorage (encrypted by OS)
- No API keys logged or exposed in plaintext
- API key validation before storage
- Secure communication with external APIs (HTTPS)
- No sensitive data in webview HTML

---

## Related Documentation

- `RULES.md` - Coding standards
- `architecture/DECISIONS.md` - Architectural decisions
- `architecture/PROJECT-MAP.md` - Project map
- `README.md` - User-facing documentation
- `DEVELOPMENT.md` - Development guide
