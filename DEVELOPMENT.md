# Development Guide

This guide explains how to test and develop the Kaiban Markdown extension in **Cursor on Mac**.

## Quick Start: Testing the Extension

### Option 1: Launch Extension Development Host (Recommended)

1. **Open the project in Cursor**
   ```bash
   cursor /path/to/kaibanmd
   ```
   Or open Cursor and use `File > Open Folder...`

2. **Press `F5`** (or go to Run & Debug panel and click "Run Extension")
   - This compiles TypeScript and opens a new Cursor/VS Code window (Extension Development Host)
   - Your extension is loaded in this new window
   - The new window will be titled "[Extension Development Host]"

3. **Test the extension**:
   - In the new Extension Development Host window, press `Cmd+Shift+P`
   - Type "Kaiban: Show Markdown Board"
   - The extension should activate and show the board

4. **Make changes and reload**:
   - Edit files in `src/` in your main Cursor window
   - Press `Cmd+Shift+B` to recompile (or run `bun run compile` in terminal)
   - In the Extension Development Host window, press `Cmd+R` to reload
   - Or click the reload icon in the window title bar
   - Changes are applied immediately

### Option 2: Watch Mode (Auto-compile) - Recommended

For faster iteration, use watch mode to auto-compile on file changes:

1. **In Cursor's integrated terminal, start watch mode**:
   ```bash
   bun run watch
   ```
   This watches for TypeScript changes and auto-compiles in the background

2. **Press `F5` to launch extension**
   - The extension will compile before launching
   - Keep watch mode running in the terminal

3. **Development workflow**:
   - Edit files in `src/` in Cursor
   - Watch mode auto-compiles (you'll see output in terminal)
   - Press `Cmd+R` in Extension Development Host window to reload
   - Repeat! This is the fastest workflow

## Testing Workflow

### Step-by-Step Testing Process

1. **Start Development Environment**:
   ```bash
   # Terminal 1: Watch mode (optional but recommended)
   bun run watch

   # Terminal 2: Run tests (optional, for unit tests)
   bun run test:watch
   ```

2. **Launch Extension** (`F5`):
   - Opens Extension Development Host window
   - Extension is loaded and activated

3. **Test Functionality** (in Extension Development Host window):
   - Open Command Palette (`Cmd+Shift+P`)
   - Run: `Kaiban: Show Markdown Board`
   - Test all commands:
     - `Kaiban: Show Markdown Board`
     - `Kaiban: Refresh Board`
     - `Kaiban: Configure AI Providers`
     - `Kaiban: Set API Key`
     - `Kaiban: Clear API Key`

4. **Create Test Data**:
   - In the Extension Development Host, open a folder with `.agent/TASKS/` directory
   - Create sample task files following the format (see README.md)
   - Test the board with real data

5. **Make Changes**:
   - Edit source files in `src/`
   - Save the file
   - If using watch mode, compilation happens automatically
   - If not, run `bun run compile` or press `Cmd+Shift+B`

6. **Reload Extension**:
   - In Extension Development Host window: Press `Cmd+R`
   - Or click the reload icon in the window title bar
   - Extension reloads with your changes

7. **Fix Issues**:
   - Check the Debug Console (bottom panel in Cursor) for errors
   - Check the Developer Tools in Extension Development Host: `Help > Toggle Developer Tools` or `Cmd+Option+I`
   - Fix errors in your main Cursor window
   - Repeat steps 5-6

## Debugging

### Debug Console

The Debug Console shows:
- Extension activation logs
- Console.log outputs
- Error messages

View it in the bottom panel when debugging.

### Developer Tools

For webview debugging (the Kanban board UI):

1. In Extension Development Host window, open Developer Tools:
   - `Help > Toggle Developer Tools`
   - Or press `Cmd+Option+I`

2. Check Console tab for webview errors
3. Inspect elements in the Kanban board
4. Check Network tab for API calls (if applicable)

### Breakpoints

Set breakpoints in TypeScript source files:
1. Click in the gutter (left of line numbers) to set a breakpoint
2. When code hits the breakpoint, execution pauses
3. Inspect variables in the Debug sidebar
4. Use debug controls to step through code

### TypeScript Errors

Check for compilation errors:
```bash
bun run compile
```

Common issues:
- Type errors: Check TypeScript compilation output
- Runtime errors: Check Debug Console
- Webview errors: Check Developer Tools Console

## Running Tests

### Unit Tests

```bash
# Run all tests once
bun run test

# Watch mode (reruns on file changes)
bun run test:watch

# With coverage report
bun run test:coverage

# Interactive UI
bun run test:ui
```

### Linting

```bash
# Check for linting issues
bun run check

# Auto-fix linting issues
bun run check:fix

# Format code
bun run format
```

## Common Development Tasks

### Add a New Command

1. Add command to `package.json` under `contributes.commands`
2. Register command in `src/extension.ts`
3. Implement command handler
4. Compile and test

### Modify the Kanban Board UI

1. Edit `src/kanbanView.ts`
2. Modify the HTML/CSS in the `getWebviewContent()` method
3. Compile and reload extension
4. Test in Extension Development Host

### Add a New Feature

1. Create/update TypeScript files in `src/`
2. Update types if needed (`src/types/`)
3. Write tests (`*.test.ts` files)
4. Test in Extension Development Host
5. Run unit tests: `bun run test`

## File Structure

```
src/
├── extension.ts          # Extension entry point, command registration
├── kanbanView.ts         # Main Kanban board UI and logic
├── taskParser.ts         # Parses markdown task files
├── adapters/             # AI provider adapters
├── config/               # Configuration management
├── services/             # Core services
├── types/                # TypeScript type definitions
└── webview/              # Webview resources (if any)

out/                      # Compiled JavaScript (generated)
```

## Tips for Efficient Development on Mac with Cursor

1. **Use Watch Mode**: `bun run watch` auto-compiles on save (run in Cursor's terminal)
2. **Use Test Watch Mode**: `bun run test:watch` for TDD
3. **Keep Extension Host Open**: Don't close the Extension Development Host window (use `Cmd+` to switch between windows)
4. **Use Reload**: `Cmd+R` in Extension Host window is faster than restarting
5. **Check Console**: Always check Debug Console (bottom panel in Cursor) for errors
6. **Incremental Changes**: Make small changes and test frequently
7. **Keyboard Shortcuts**:
   - `F5`: Launch Extension Development Host
   - `Cmd+R`: Reload extension in Extension Host window
   - `Cmd+Shift+B`: Build/compile (if not using watch mode)
   - `Cmd+Shift+P`: Command Palette
   - `Cmd+Option+I`: Developer Tools (in Extension Host window)

## Troubleshooting

### Extension doesn't activate

- Check Debug Console for errors
- Verify `package.json` is valid
- Ensure TypeScript compiled successfully (`out/extension.js` exists)

### Changes not appearing

- Did you compile? (`bun run compile` or watch mode)
- Did you reload? (`Cmd+R` in Extension Development Host)
- Check if file was saved

### TypeScript errors

- Run `bun run compile` to see all errors
- Fix type errors before testing
- Check `tsconfig.json` configuration

### Webview not showing

- Check Developer Tools Console for errors
- Verify webview HTML is valid
- Check CSP (Content Security Policy) in webview code

### Can't find command

- Verify command is registered in `extension.ts`
- Check `package.json` has command definition
- Reload extension after adding new commands

## Next Steps

- Read `CONTRIBUTING.md` for contribution guidelines
- Check `README.md` for user documentation
- Review `.agent/SYSTEM/RULES.md` for coding standards

