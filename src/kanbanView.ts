import * as vscode from "vscode";
import { type Task, TaskParser } from "./taskParser";

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
          case "updateTaskStatus":
            await this.updateTaskStatus(message.taskId, message.newStatus);
            break;
          case "rejectTask":
            await this.rejectTask(message.taskId, message.note);
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
        } catch (_error) {}
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

  private async updateTaskStatus(taskId: string, newStatus: string) {
    try {
      await this.taskParser.updateTaskStatus(
        taskId,
        newStatus as "Backlog" | "To Do" | "Testing" | "Done"
      );
      // Refresh the board after updating
      await this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update task status: ${error}`);
    }
  }

  private async rejectTask(taskId: string, note: string) {
    try {
      await this.taskParser.rejectTask(taskId, note);
      // Refresh the board after rejecting
      await this.refresh();
      vscode.window.showInformationMessage(`Task rejected and moved back to To Do`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to reject task: ${error}`);
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
    // Sort function: High > Medium > Low
    const sortByPriority = (tasks: Task[]) => {
      const priorityOrder = { High: 0, Medium: 1, Low: 2 };
      return tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    };

    const backlogTasks = sortByPriority(groupedTasks.Backlog || []);
    const todoTasks = sortByPriority(groupedTasks["To Do"] || []);
    const testingTasks = sortByPriority(groupedTasks.Testing || []);
    const doneTasks = sortByPriority(groupedTasks.Done || []);

    const renderTask = (task: Task) => {
      const priorityClass = task.priority.toLowerCase();
      const completedClass = task.completed ? "completed" : "";
      const isInTesting = task.status === "Testing";
      const hasAgent = task.claimedBy && task.claimedBy.length > 0;
      const agentPlatform = hasAgent ? task.claimedBy.split("-")[0] : "";

      return `
        <div class="task-card ${priorityClass} ${completedClass}"
             draggable="true"
             data-filepath="${task.filePath}"
             data-task-id="${task.id}"
             data-prd-path="${task.prdPath}"
             data-status="${task.status}">
          <div class="task-header">
            <span class="task-title">${this.escapeHtml(task.label)}</span>
            ${task.completed ? '<span class="task-check">[Done]</span>' : ""}
          </div>
          <div class="task-meta">
            <span class="badge priority-${priorityClass}">${task.priority}</span>
            <span class="badge type">${task.type}</span>
            ${hasAgent ? `<span class="badge agent-badge">🤖 ${agentPlatform}</span>` : ""}
            ${task.rejectionCount > 0 ? `<span class="badge rejection-badge">↩ ${task.rejectionCount}</span>` : ""}
          </div>
          <div class="task-footer">
            <span class="project-name">${this.escapeHtml(task.project)}</span>
            ${isInTesting ? `<button class="reject-btn" onclick="showRejectModal('${task.id}')" title="Reject and return to To Do">Reject</button>` : ""}
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

    .header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .action-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }

    .action-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .secondary-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .secondary-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
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

    .task-card.dragging {
      opacity: 0.5;
      cursor: move;
    }

    .column.drag-over {
      background: var(--vscode-list-hoverBackground);
      border: 2px dashed var(--vscode-focusBorder);
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

    .agent-badge {
      background: rgba(33, 150, 243, 0.2);
      color: #2196f3;
    }

    .rejection-badge {
      background: rgba(244, 67, 54, 0.2);
      color: #f44336;
    }

    .task-footer {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .project-name {
      opacity: 0.8;
    }

    .reject-btn {
      background: rgba(244, 67, 54, 0.2);
      color: #f44336;
      border: 1px solid #f44336;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .reject-btn:hover {
      background: #f44336;
      color: white;
    }

    /* Reject Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 20px;
      width: 400px;
      max-width: 90%;
    }

    .modal h3 {
      margin: 0 0 15px 0;
      color: var(--vscode-foreground);
    }

    .modal textarea {
      width: 100%;
      min-height: 80px;
      padding: 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      resize: vertical;
    }

    .modal-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 15px;
    }

    .modal-btn {
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      border: none;
    }

    .modal-btn-cancel {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .modal-btn-reject {
      background: #f44336;
      color: white;
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
      <div class="header-actions">
        <button class="action-btn secondary-btn" onclick="toggleSort()" id="sortBtn">
          Sort: Priority
        </button>
        <button class="action-btn" onclick="refresh()">Refresh</button>
      </div>
    </div>

  <div class="board" id="kanbanBoard">
    <div class="column" data-status="Backlog">
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

    <div class="column" data-status="To Do">
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

    <div class="column" data-status="Testing">
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

    <div class="column" data-status="Done">
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

  <!-- Reject Modal -->
  <div class="modal-overlay" id="rejectModal" style="display: none;">
    <div class="modal">
      <h3>Reject Task</h3>
      <p style="margin-bottom: 10px; color: var(--vscode-descriptionForeground);">
        Provide feedback for the agent. The task will return to To Do.
      </p>
      <textarea id="rejectNote" placeholder="What needs to be fixed or changed?"></textarea>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" onclick="hideRejectModal()">Cancel</button>
        <button class="modal-btn modal-btn-reject" onclick="submitRejection()">Reject Task</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let draggedElement = null;
    let sortByPriority = true;
    let currentRejectTaskId = null;

    // Reject modal functions
    function showRejectModal(taskId) {
      currentRejectTaskId = taskId;
      document.getElementById('rejectModal').style.display = 'flex';
      document.getElementById('rejectNote').value = '';
      document.getElementById('rejectNote').focus();
    }

    function hideRejectModal() {
      document.getElementById('rejectModal').style.display = 'none';
      currentRejectTaskId = null;
    }

    function submitRejection() {
      const note = document.getElementById('rejectNote').value.trim();
      if (!note) {
        alert('Please provide feedback for the agent.');
        return;
      }
      if (currentRejectTaskId) {
        vscode.postMessage({
          command: 'rejectTask',
          taskId: currentRejectTaskId,
          note: note
        });
        hideRejectModal();
      }
    }

    // Close modal on overlay click
    document.getElementById('rejectModal').addEventListener('click', (e) => {
      if (e.target.id === 'rejectModal') {
        hideRejectModal();
      }
    });

    // Click handler for task cards
    document.addEventListener('click', (e) => {
      // Check if clicking on a link within PRD content first
      const link = e.target.closest('a');
      if (link && link.closest('#prdContent')) {
        e.preventDefault();
        e.stopPropagation();
        const href = link.getAttribute('href');
        
        // Check if it's a relative path (not http/https/mailto)
        if (href && !href.match(/^(https?:|mailto:|#)/)) {
          // Load this file in the PRD preview
          vscode.postMessage({
            command: 'loadPRD',
            prdPath: href
          });
        } else if (href && href.match(/^https?:/)) {
          // External links should open in browser
          return true;
        }
        return false;
      }

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

    // Drag and drop handlers
    document.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.task-card');
      if (card) {
        draggedElement = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', card.innerHTML);
      }
    });

    document.addEventListener('dragend', (e) => {
      const card = e.target.closest('.task-card');
      if (card) {
        card.classList.remove('dragging');
        draggedElement = null;
      }
      // Remove drag-over class from all columns
      document.querySelectorAll('.column').forEach(col => col.classList.remove('drag-over'));
    });

    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      const column = e.target.closest('.column');
      if (column && draggedElement) {
        e.dataTransfer.dropEffect = 'move';
        // Add visual feedback
        document.querySelectorAll('.column').forEach(col => col.classList.remove('drag-over'));
        column.classList.add('drag-over');
      }
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const column = e.target.closest('.column');
      
      if (column && draggedElement) {
        const newStatus = column.dataset.status;
        const taskId = draggedElement.dataset.taskId;
        const currentStatus = draggedElement.dataset.status;
        
        // Only update if status changed
        if (newStatus !== currentStatus) {
          vscode.postMessage({
            command: 'updateTaskStatus',
            taskId: taskId,
            newStatus: newStatus
          });
        }
        
        // Remove drag-over class
        column.classList.remove('drag-over');
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

    // Toggle sort handler
    function toggleSort() {
      sortByPriority = !sortByPriority;
      const sortBtn = document.getElementById('sortBtn');
      
      if (sortByPriority) {
        sortBtn.textContent = 'Sort: Priority';
        sortTasksByPriority();
      } else {
        sortBtn.textContent = 'Sort: Default';
        sortTasksByDefault();
      }
    }

    function sortTasksByPriority() {
      const columns = document.querySelectorAll('.column');
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      
      columns.forEach(column => {
        const content = column.querySelector('.column-content');
        const tasks = Array.from(content.querySelectorAll('.task-card'));
        const emptyState = content.querySelector('.empty-state');
        
        if (tasks.length === 0) return;
        
        tasks.sort((a, b) => {
          const aPriority = a.classList.contains('high') ? 'high' : 
                          a.classList.contains('medium') ? 'medium' : 'low';
          const bPriority = b.classList.contains('high') ? 'high' : 
                          b.classList.contains('medium') ? 'medium' : 'low';
          return priorityOrder[aPriority] - priorityOrder[bPriority];
        });
        
        // Clear and re-append
        content.innerHTML = '';
        tasks.forEach(task => content.appendChild(task));
        if (emptyState) content.appendChild(emptyState);
      });
    }

    function sortTasksByDefault() {
      // Refresh to get original order
      refresh();
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
