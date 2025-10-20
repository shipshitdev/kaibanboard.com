import * as vscode from "vscode";
import { Task, TaskParser } from "./taskParser";

export class KanbanViewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private taskParser: TaskParser;

  constructor(private context: vscode.ExtensionContext) {
    this.taskParser = new TaskParser();
  }

  public async show() {
    if (this.panel) {
      this.panel.reveal();
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "kaibanBoard",
      "Kaiban Markdown",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "openTask":
            await this.openTaskFile(message.filePath);
            break;
          case "refresh":
            await this.refresh();
            break;
          case "loadPRD":
            await this.loadPRDContent(message.prdPath);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    await this.refresh();
  }

  public async refresh() {
    if (!this.panel) {
      return;
    }

    const tasks = await this.taskParser.parseTasks();
    const groupedTasks = this.taskParser.groupByStatus(tasks);

    this.panel.webview.html = this.getWebviewContent(groupedTasks);
  }

  private async openTaskFile(filePath: string) {
    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open task file: ${error}`);
    }
  }

  private async loadPRDContent(prdPath: string) {
    if (!this.panel) {
      return;
    }

    try {
      // Find the PRD file in workspace
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        return;
      }

      let prdContent = "";

      // Try to find PRD file in each workspace folder
      for (const folder of workspaceFolders) {
        const prdUri = vscode.Uri.joinPath(folder.uri, prdPath);
        try {
          const document = await vscode.workspace.openTextDocument(prdUri);
          prdContent = document.getText();
          break;
        } catch (error) {
          // Continue to next folder
          continue;
        }
      }

      if (prdContent) {
        // Simple markdown rendering (basic)
        const renderedContent = this.renderMarkdown(prdContent);
        this.panel.webview.postMessage({
          command: "updatePRDContent",
          content: renderedContent,
        });
      } else {
        this.panel.webview.postMessage({
          command: "updatePRDContent",
          content: "<p>PRD file not found or could not be loaded.</p>",
        });
      }
    } catch (error) {
      this.panel.webview.postMessage({
        command: "updatePRDContent",
        content: `<p>Error loading PRD: ${error}</p>`,
      });
    }
  }

  private renderMarkdown(content: string): string {
    // Simple markdown rendering - convert basic elements
    let html = content
      // Headers
      .replace(/^### (.*$)/gm, "<h3>$1</h3>")
      .replace(/^## (.*$)/gm, "<h2>$1</h2>")
      .replace(/^# (.*$)/gm, "<h1>$1</h1>")
      // Bold
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      // Code blocks
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      // Inline code
      .replace(/`(.*?)`/g, "<code>$1</code>")
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // Line breaks
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");

    // Wrap in paragraph tags
    html = `<p>${html}</p>`;

    return html;
  }

  private getWebviewContent(groupedTasks: Record<string, Task[]>): string {
    const backlogTasks = groupedTasks["Backlog"] || [];
    const todoTasks = groupedTasks["To Do"] || [];
    const testingTasks = groupedTasks["Testing"] || [];
    const doneTasks = groupedTasks["Done"] || [];

    const renderTask = (task: Task) => {
      const priorityClass = task.priority.toLowerCase();
      const completedClass = task.completed ? "completed" : "";

      return `
        <div class="task-card ${priorityClass} ${completedClass}" data-filepath="${
        task.filePath
      }" data-task-id="${task.id}" data-prd-path="${task.prdPath}">
          <div class="task-header">
            <span class="task-title">${this.escapeHtml(task.label)}</span>
            ${task.completed ? '<span class="task-check">[Done]</span>' : ""}
          </div>
          <div class="task-meta">
            <span class="badge priority-${priorityClass}">${
        task.priority
      }</span>
            <span class="badge type">${task.type}</span>
          </div>
          <div class="task-footer">
            <span class="project-name">${this.escapeHtml(task.project)}</span>
          </div>
        </div>
      `;
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kanban Board</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .title {
      font-size: 24px;
      font-weight: 600;
    }

    .refresh-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }

    .refresh-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .board {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      height: calc(100vh - 100px);
    }

    .board.with-prd {
      grid-template-columns: 1fr 1fr 1fr 1fr 40%;
    }

    .column {
      background: var(--vscode-sideBar-background);
      border-radius: 8px;
      padding: 15px;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .column-header {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--vscode-panel-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .column-count {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
    }

    .column-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .task-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .task-card:hover {
      border-color: var(--vscode-focusBorder);
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    .task-card.selected {
      border-color: var(--vscode-focusBorder);
      border-width: 2px;
      background: var(--vscode-list-activeSelectionBackground);
    }

    .task-card.completed {
      opacity: 0.7;
    }

    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 8px;
    }

    .task-title {
      font-weight: 500;
      line-height: 1.4;
      flex: 1;
    }

    .task-check {
      color: #4caf50;
      font-size: 18px;
      margin-left: 8px;
    }

    .task-meta {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }

    .badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 3px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .priority-high {
      background: rgba(244, 67, 54, 0.2);
      color: #f44336;
    }

    .priority-medium {
      background: rgba(255, 152, 0, 0.2);
      color: #ff9800;
    }

    .priority-low {
      background: rgba(76, 175, 80, 0.2);
      color: #4caf50;
    }

    .type {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .task-footer {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 6px;
    }

    .project-name {
      opacity: 0.8;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    /* Scrollbar */
    .column-content::-webkit-scrollbar {
      width: 8px;
    }

    .column-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .column-content::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 4px;
    }

    .column-content::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground);
    }

    .prd-preview-panel {
      background: var(--vscode-sideBar-background);
      border-radius: 8px;
      padding: 15px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-left: 1px solid var(--vscode-panel-border);
    }

    .prd-header {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--vscode-panel-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .prd-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .prd-placeholder {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    .close-prd-btn {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 16px;
    }

    .close-prd-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .prd-markdown {
      line-height: 1.6;
    }

    .prd-markdown h1, .prd-markdown h2, .prd-markdown h3 {
      margin-top: 20px;
      margin-bottom: 10px;
      color: var(--vscode-foreground);
    }

    .prd-markdown p {
      margin-bottom: 12px;
    }

    .prd-markdown code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }

    .prd-markdown pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 12px 0;
    }
  </style>
</head>
<body>
    <div class="header">
      <div class="title">Kaiban Markdown</div>
      <button class="refresh-btn" onclick="refresh()">Refresh</button>
    </div>

  <div class="board" id="kanbanBoard">
    <div class="column">
      <div class="column-header">
        <span>Backlog</span>
        <span class="column-count">${backlogTasks.length}</span>
      </div>
      <div class="column-content">
        ${
          backlogTasks.length > 0
            ? backlogTasks.map(renderTask).join("")
            : '<div class="empty-state">No tasks in backlog</div>'
        }
      </div>
    </div>

    <div class="column">
      <div class="column-header">
        <span>To Do</span>
        <span class="column-count">${todoTasks.length}</span>
      </div>
      <div class="column-content">
        ${
          todoTasks.length > 0
            ? todoTasks.map(renderTask).join("")
            : '<div class="empty-state">No tasks to do</div>'
        }
      </div>
    </div>

    <div class="column">
      <div class="column-header">
        <span>Testing</span>
        <span class="column-count">${testingTasks.length}</span>
      </div>
      <div class="column-content">
        ${
          testingTasks.length > 0
            ? testingTasks.map(renderTask).join("")
            : '<div class="empty-state">No tasks in testing</div>'
        }
      </div>
    </div>

    <div class="column">
      <div class="column-header">
        <span>Done</span>
        <span class="column-count">${doneTasks.length}</span>
      </div>
      <div class="column-content">
        ${
          doneTasks.length > 0
            ? doneTasks.map(renderTask).join("")
            : '<div class="empty-state">No completed tasks</div>'
        }
      </div>
    </div>

    <div class="prd-preview-panel" id="prdPanel" style="display: none;">
      <div class="prd-header">
        <span>PRD Preview</span>
        <button class="close-prd-btn" onclick="closePRD()">×</button>
      </div>
      <div class="prd-content" id="prdContent">
        <div class="prd-placeholder">Select a task to view its PRD</div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    // Click handler for task cards
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.task-card');
      if (card) {
        const filePath = card.dataset.filepath;
        const prdPath = card.dataset.prdPath;
        
        // Remove selection from all cards
        document.querySelectorAll('.task-card').forEach(c => c.classList.remove('selected'));
        
        // Select current card
        card.classList.add('selected');
        
        // Show PRD preview if PRD path exists
        if (prdPath) {
          showPRDPreview(prdPath);
        }
        
        // Open task file
        vscode.postMessage({
          command: 'openTask',
          filePath: filePath
        });
      }
    });

    // Show PRD preview
    function showPRDPreview(prdPath) {
      const board = document.getElementById('kanbanBoard');
      const panel = document.getElementById('prdPanel');
      const content = document.getElementById('prdContent');
      
      // Add with-prd class to board
      board.classList.add('with-prd');
      
      // Show PRD panel
      panel.style.display = 'flex';
      
      // Load PRD content
      vscode.postMessage({
        command: 'loadPRD',
        prdPath: prdPath
      });
    }

    // Close PRD preview
    function closePRD() {
      const board = document.getElementById('kanbanBoard');
      const panel = document.getElementById('prdPanel');
      const content = document.getElementById('prdContent');
      
      // Remove with-prd class from board
      board.classList.remove('with-prd');
      
      // Hide PRD panel
      panel.style.display = 'none';
      
      // Clear selection
      document.querySelectorAll('.task-card').forEach(c => c.classList.remove('selected'));
      
      // Reset content
      content.innerHTML = '<div class="prd-placeholder">Select a task to view its PRD</div>';
    }

    // Refresh handler
    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    // Handle PRD content updates
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'updatePRDContent') {
        const content = document.getElementById('prdContent');
        content.innerHTML = \`<div class="prd-markdown">\${message.content}</div>\`;
      }
    });
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
