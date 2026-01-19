## Task: Desktop App

**ID:** task-desktop-app
**Label:** Desktop App
**Description:** Standalone Electron desktop application for macOS, Windows, and Linux with feature parity to VS Code extension.
**Type:** Feature
**Status:** To Do
**Priority:** Low
**Created:** 2026-01-15
**Updated:** 2026-01-15
**PRD:** [Link](../PRDS/desktop-app.md)
**Order:** 12

---

## Details

### Scope

1. **Electron App**: macOS, Windows, Linux
2. **Feature Parity**: Kanban, tasks, PRDs, execution
3. **Native Integration**: Notifications, tray, file associations
4. **Auto-Updates**: electron-updater
5. **Distribution**: GitHub Releases

### Key Deliverables

- [ ] packages/desktop package structure
- [ ] Electron main process
- [ ] Shared UI components with extension
- [ ] Platform-specific builds
- [ ] Code signing (macOS, Windows)
- [ ] Auto-update implementation

### Technology Stack

- Electron
- React (shared with extension webview)
- electron-builder
- xterm.js for terminal

### Build Targets

- macOS: DMG (x64 + arm64)
- Windows: NSIS (x64)
- Linux: AppImage, .deb, .rpm

### Code Sharing

```typescript
// Platform adapter pattern
interface PlatformAdapter {
  readFile(path: string): Promise<string>;
  executeCommand(command: string): Promise<void>;
  showNotification(title: string, body: string): void;
}
```

### Success Criteria

- App builds for all platforms
- Feature parity with extension
- Auto-updates work
- Code signed for distribution
