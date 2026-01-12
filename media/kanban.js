const vscode = acquireVsCodeApi();
const draggedElement = null;
const isDragging = false;
const currentSortMode = "default"; // 'default', 'priority-asc', 'priority-desc'
const originalTaskOrder = new Map(); // Store original order of tasks per column

// Agent modal state
const currentAgentTaskId = null;
const availableProviders = [];
const availableModels = [];

// Claude execution state
const currentPrdTaskId = null;
const runningTasks = new Set(); // Track task IDs that are currently executing

// Rate limit state
let rateLimitTaskId = null;
let rateLimitEndTime = null;
const rateLimitInterval = null;

// Rate limit functions
function startRateLimitCountdown(taskId, waitSeconds) {
      rateLimitTaskId = taskId;
      rateLimitEndTime = Date.now() + (waitSeconds * 1000);

      // Get task name
      const card = document.querySelector(`[data-task-id="${taskId}"]`);
      const taskName = card ? card.dataset.label : 'Unknown task';
      document.getElementById('rateLimitTaskName').textContent = taskName;

      // Show banner
      document.getElementById('rateLimitBanner').classList.add('active');
      document.body.classList.add('has-rate-limit-banner');

      // Update task card to show rate-limited state
      if (card) {
        card.classList.remove('running');
        card.classList.add('rate-limited');
      }

      // Start countdown interval
      rateLimitInterval = setInterval(updateRateLimitTimer, 1000);
      updateRateLimitTimer();
    }

    function updateRateLimitTimer() {
      if (!rateLimitEndTime) return;

      const remaining = Math.max(0, rateLimitEndTime - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      const timerStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      document.getElementById('rateLimitTimer').textContent = timerStr;

      if (remaining <= 0) {
        // Timer expired - will be handled by extension auto-retry
        clearRateLimitUI();
      }
    }

    function retryRateLimitNow() {
      if (rateLimitTaskId) {
        vscode.postMessage({
          command: 'retryAfterRateLimit',
          taskId: rateLimitTaskId
        });
        clearRateLimitUI();
      }
    }

    function cancelRateLimitWait() {
      if (rateLimitTaskId) {
        vscode.postMessage({
          command: 'stopClaudeExecution',
          taskId: rateLimitTaskId
        });
        clearRateLimitUI();
      }
    }

    function clearRateLimitUI() {
      if (rateLimitInterval) {
        clearInterval(rateLimitInterval);
        rateLimitInterval = null;
      }

      // Hide banner
      document.getElementById('rateLimitBanner').classList.remove('active');
      document.body.classList.remove('has-rate-limit-banner');

      // Clear task card state
      if (rateLimitTaskId) {
        const card = document.querySelector(`[data-task-id="${rateLimitTaskId}"]`);
        if (card) {
          card.classList.remove('rate-limited');
        }
      }

      rateLimitTaskId = null;
      rateLimitEndTime = null;
    }

    function triggerRateLimitFromUI(taskId) {
      // Allow user to manually trigger rate limit wait from task card
      const waitMinutes = prompt('Enter wait time in minutes:', '5');
      if (waitMinutes && !isNaN(parseInt(waitMinutes))) {
        const waitSeconds = parseInt(waitMinutes) * 60;
        vscode.postMessage({
          command: 'triggerRateLimitWait',
          taskId: taskId,
          waitSeconds: waitSeconds
        });
      }
    }

    // Claude CLI execution functions
    function toggleExecution(taskId) {
      if (runningTasks.has(taskId)) {
        // Stop the execution
        appendToTerminal(`Stopping execution for task ${taskId}...`, 'info');
        vscode.postMessage({
          command: 'stopClaudeExecution',
          taskId: taskId
        });
      } else {
        // Start the execution - show terminal and log start
        showTerminalPanel();
        const card = document.querySelector(`[data-task-id="${taskId}"]`);
        const taskName = card ? card.dataset.label : taskId;
        appendToTerminal(`Starting execution: ${taskName}`, 'info');
        appendToTerminal(`Task ID: ${taskId}`, 'info');
        appendToTerminal('---', 'info');

        vscode.postMessage({
          command: 'executeViaClaude',
          taskId: taskId
        });
      }
    }

    function executePRD() {
      if (currentPrdTaskId) {
        toggleExecution(currentPrdTaskId);
      }
    }

    function updateTaskRunningState(taskId, isRunning) {
      const card = document.querySelector(`[data-task-id="${taskId}"]`);
      if (card) {
        card.classList.toggle('running', isRunning);
        const btn = card.querySelector('.play-stop-btn');
        if (btn) {
          btn.classList.toggle('running', isRunning);
          btn.innerHTML = isRunning ? '⏹' : '▶';
          btn.title = isRunning ? 'Stop execution' : 'Execute via Claude';
        }
      }

      // Also update PRD panel button if this task is selected
      if (currentPrdTaskId === taskId) {
        const prdBtn = document.getElementById('playPrdBtn');
        if (prdBtn) {
          prdBtn.innerHTML = isRunning ? '⏹ Stop' : '▶ Execute';
          prdBtn.classList.toggle('running', isRunning);
        }
      }
    }

    // Agent modal functions
    function showAgentModal(taskId) {
      currentAgentTaskId = taskId;

      // Get task card data
      const card = document.querySelector(`[data-task-id="${taskId}"]`);
      if (card) {
        document.getElementById('agentModalTaskTitle').textContent = card.dataset.label || '';
        document.getElementById('agentModalTaskDescription').textContent = card.dataset.description || 'No description';
      }

      // Reset form
      document.getElementById('providerSelect').value = '';
      document.getElementById('modelSelectGroup').style.display = 'none';
      document.getElementById('cursorOptions').style.display = 'none';
      document.getElementById('sendToAgentBtn').disabled = true;
      document.getElementById('noProvidersWarning').style.display = 'none';
      document.getElementById('agentMethod').checked = true;
      document.getElementById('ralphMethod').checked = false;
      onExecutionMethodChange();

      // Show modal
      document.getElementById('agentModal').style.display = 'flex';

      // Request available providers
      vscode.postMessage({ command: 'getAvailableProviders' });
    }

    function hideAgentModal() {
      document.getElementById('agentModal').style.display = 'none';
      currentAgentTaskId = null;
    }

    function onProviderChange() {
      const provider = document.getElementById('providerSelect').value;
      const modelGroup = document.getElementById('modelSelectGroup');
      const cursorOptions = document.getElementById('cursorOptions');
      const sendBtn = document.getElementById('sendToAgentBtn');

      if (!provider) {
        modelGroup.style.display = 'none';
        cursorOptions.style.display = 'none';
        sendBtn.disabled = true;
        return;
      }

      // Show/hide Cursor-specific options
      cursorOptions.style.display = provider === 'cursor' ? 'block' : 'none';

      // For Cursor, no model selection needed (agent mode)
      if (provider === 'cursor') {
        modelGroup.style.display = 'none';
        sendBtn.disabled = false;
      } else {
        // Request models for this provider
        modelGroup.style.display = 'block';
        document.getElementById('modelSelect').innerHTML = '<option value="">Loading models...</option>';
        sendBtn.disabled = true;
        vscode.postMessage({ command: 'getModelsForProvider', provider: provider });
      }
    }

    function onModelChange() {
      const model = document.getElementById('modelSelect').value;
      document.getElementById('sendToAgentBtn').disabled = !model;
    }

    function onExecutionMethodChange() {
      const ralphMethod = document.getElementById('ralphMethod').checked;
      const agentMethod = document.getElementById('agentMethod').checked;
      const ralphSection = document.getElementById('ralphSection');
      const providerGroup = document.getElementById('providerSelectGroup');
      const modelGroup = document.getElementById('modelSelectGroup');
      const cursorOptions = document.getElementById('cursorOptions');
      const sendBtn = document.getElementById('sendToAgentBtn');

      if (ralphMethod) {
        // Ralph Loop selected
        ralphSection.style.display = 'block';
        providerGroup.style.display = 'none';
        modelGroup.style.display = 'none';
        cursorOptions.style.display = 'none';
        sendBtn.disabled = false;
        sendBtn.textContent = 'Execute with Ralph';
      } else if (agentMethod) {
        // AI Agent selected
        ralphSection.style.display = 'none';
        providerGroup.style.display = 'block';
        sendBtn.textContent = 'Send to Agent';
        // Reset provider selection state
        const provider = document.getElementById('providerSelect').value;
        if (!provider) {
          sendBtn.disabled = true;
        } else {
          onProviderChange();
        }
      }
    }

    function confirmSendToAgent() {
      if (!currentAgentTaskId) return;

      const ralphMethod = document.getElementById('ralphMethod').checked;
      const agentMethod = document.getElementById('agentMethod').checked;

      if (ralphMethod) {
        // Execute Ralph command
        const btn = document.getElementById('sendToAgentBtn');
        btn.disabled = true;
        btn.innerHTML = 'Executing... <span class="loading-spinner"></span>';

        vscode.postMessage({
          command: 'executeRalphCommand',
          taskId: currentAgentTaskId
        });
        return;
      }

      if (agentMethod) {
        // Send to AI Agent (existing logic)
        const provider = document.getElementById('providerSelect').value;
        const model = document.getElementById('modelSelect').value;
        const createPR = document.getElementById('createPR').checked;

        if (!provider) {
          alert('Please select a provider.');
          return;
        }

        if (provider !== 'cursor' && !model) {
          alert('Please select a model.');
          return;
        }

        // Show loading state
        const btn = document.getElementById('sendToAgentBtn');
        btn.disabled = true;
        btn.innerHTML = 'Sending... <span class="loading-spinner"></span>';

        vscode.postMessage({
          command: 'sendToAgent',
          taskId: currentAgentTaskId,
          provider: provider,
          model: model || undefined,
          options: {
            createPR: createPR
          }
        });
      }
    }

    function configureProviders() {
      hideAgentModal();
      vscode.postMessage({ command: 'configureProviders' });
    }

    // Close agent modal on overlay click
    document.getElementById('agentModal').addEventListener('click', (e) => {
      if (e.target.id === 'agentModal') {
        hideAgentModal();
      }
    });

    // Click handler for task cards
    document.addEventListener('click', (e) => {
      // Ignore clicks if we just finished dragging
      if (isDragging) {
        return;
      }

      // Check if clicking on a link within PRD content first
      const link = e.target.closest('a');
      if (link && link.closest('#prdContent')) {
        e.preventDefault();
        e.stopPropagation();
        const href = link.getAttribute('href');

        // Check if it's a relative path (not http/https/mailto)
        if (href && !href.match(/^(https?:|mailto:|#)/)) {
          // Load this file in the PRD preview
          // Try to get task file path from the PRD content's context
          const prdCard = link.closest('.task-card');
          const taskFilePath = prdCard ? prdCard.dataset.filepath : undefined;
          vscode.postMessage({
            command: 'loadPRD',
            prdPath: href,
            taskFilePath: taskFilePath
          });
        } else if (href && href.match(/^https?:/)) {
          // External links should open in browser
          return true;
        }
        return false;
      }

      const card = e.target.closest('.task-card');
      if (card) {
        const prdPath = card.dataset.prdPath;

        // Remove selection from all cards
        document.querySelectorAll('.task-card').forEach(c => c.classList.remove('selected'));

        // Select current card
        card.classList.add('selected');

        // Always show PRD panel when task is selected
        const board = document.getElementById('kanbanBoard');
        const panel = document.getElementById('prdPanel');
        const prdContent = document.getElementById('prdContent');

        if (prdPath) {
          showPRDPreview(prdPath);
        } else {
          // If no PRD, show sidebar with placeholder
          if (board && panel && prdContent) {
            board.classList.add('with-prd-sidebar');
            panel.style.display = 'flex';
            panel.style.visibility = 'visible';
            requestAnimationFrame(() => {
              panel.setAttribute('data-visible', 'true');
            });
            prdContent.innerHTML = '<div class="prd-placeholder">This task has no PRD linked</div>';

            // Update terminal panel positioning if visible
            const terminalPanel = document.getElementById('terminalPanel');
            if (terminalPanel && terminalPanel.getAttribute('data-visible') === 'true') {
              terminalPanel.classList.add('with-sidebar');
            }
          }
        }
      }
    });

    // Double-click handler for task cards (opens file)
    document.addEventListener('dblclick', (e) => {
      const card = e.target.closest('.task-card');
      if (card) {
        const filePath = card.dataset.filepath;
        if (filePath) {
          vscode.postMessage({
            command: 'openTask',
            filePath: filePath
          });
        }
      }
    });

    // Drag and drop handlers
    document.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.task-card');
      if (card) {
        isDragging = true;
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
      // Reset dragging flag after a short delay to allow drop event to process
      setTimeout(() => { isDragging = false; }, 100);
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

        // Calculate new order based on drop position
        // First, temporarily move the element to the correct position in DOM
        const dropTarget = e.target.closest('.task-card');
        if (dropTarget && dropTarget !== draggedElement && dropTarget.parentElement === column) {
          // Insert before the target
          column.insertBefore(draggedElement, dropTarget);
        } else if (!dropTarget || dropTarget === draggedElement) {
          // Dropped at end or on empty space - append to end
          column.appendChild(draggedElement);
        }

        // Now calculate order based on actual DOM position
        // Get all task cards in the column after DOM update
        const allTasksInColumn = Array.from(column.querySelectorAll('.task-card'));
        const droppedIndex = allTasksInColumn.indexOf(draggedElement);

        // Calculate order: if there are tasks before it, use their max order + 1
        // Otherwise use index + 1
        let newOrder = 1;
        if (droppedIndex === 0) {
          // First task - order is 1
          newOrder = 1;
        } else {
          // Look at the task before it to determine order
          const previousTask = allTasksInColumn[droppedIndex - 1];
          const previousOrder = parseInt(previousTask.dataset.order || '0', 10);
          if (previousOrder > 0) {
            // Use previous order + 1
            newOrder = previousOrder + 1;
          } else {
            // Previous task doesn't have order, use index + 1
            newOrder = droppedIndex + 1;
          }
        }

        // Update order and status if changed
        if (newStatus !== currentStatus) {
          vscode.postMessage({
            command: 'updateTaskOrder',
            taskId: taskId,
            order: newOrder,
            newStatus: newStatus
          });
        } else {
          // Same column, just reordering
          vscode.postMessage({
            command: 'updateTaskOrder',
            taskId: taskId,
            order: newOrder
          });
        }

        // Re-store original order after task moves
        setTimeout(() => storeOriginalOrder(), 100);

        // Remove drag-over class
        column.classList.remove('drag-over');
      }
    });

    // Show PRD preview
    function showPRDPreview(prdPath) {
      const board = document.getElementById('kanbanBoard');
      const panel = document.getElementById('prdPanel');
      const content = document.getElementById('prdContent');
      const terminalPanel = document.getElementById('terminalPanel');

      if (!board || !panel) return;

      // Add with-prd-sidebar class to board
      board.classList.add('with-prd-sidebar');

      // Show PRD sidebar with animation (slides in from right)
      panel.style.display = 'flex';
      panel.style.visibility = 'visible';
      // Use requestAnimationFrame to ensure display is applied before setting data attribute
      requestAnimationFrame(() => {
        panel.setAttribute('data-visible', 'true');
      });

      // Update terminal panel positioning if it's visible
      if (terminalPanel && terminalPanel.getAttribute('data-visible') === 'true') {
        terminalPanel.classList.add('with-sidebar');
      }

      // Get the selected card to find the task file path and track for Claude execution
      const selectedCard = document.querySelector('.task-card.selected');
      const taskFilePath = selectedCard ? selectedCard.dataset.filepath : undefined;
      currentPrdTaskId = selectedCard ? selectedCard.dataset.taskId : null;

      // Show/hide the Execute button based on whether we have a task
      const playBtn = document.getElementById('playPrdBtn');
      if (playBtn) {
        playBtn.style.display = currentPrdTaskId ? 'inline-block' : 'none';
      }

      // Load PRD content with task file path for accurate resolution
      vscode.postMessage({
        command: 'loadPRD',
        prdPath: prdPath,
        taskFilePath: taskFilePath
      });
    }

    // Close PRD preview
    function closePRD() {
      const board = document.getElementById('kanbanBoard');
      const panel = document.getElementById('prdPanel');
      const content = document.getElementById('prdContent');
      const terminalPanel = document.getElementById('terminalPanel');

      if (!board || !panel) return;

      // Remove with-prd-sidebar class from board
      board.classList.remove('with-prd-sidebar');

      // Hide PRD sidebar with animation (slides out to right)
      panel.setAttribute('data-visible', 'false');
      // Wait for animation to complete before hiding
      setTimeout(() => {
        panel.style.display = 'none';
        panel.style.visibility = 'hidden';
      }, 300);

      // Update terminal panel positioning
      if (terminalPanel) {
        terminalPanel.classList.remove('with-sidebar');
      }

      // Clear selection
      document.querySelectorAll('.task-card').forEach(c => c.classList.remove('selected'));

      // Reset content
      if (content) {
        content.innerHTML = '<div class="prd-placeholder">Select a task to view its PRD</div>';
      }

      // Hide create/edit buttons
      const editBtn = document.getElementById('editPrdBtn');
      const createBtn = document.getElementById('createPrdBtn');
      if (editBtn) editBtn.style.display = 'none';
      if (createBtn) createBtn.style.display = 'none';
    }

    // Create PRD for current task
    function createPRD() {
      if (!currentPrdTaskId) return;
      const panel = document.getElementById('prdPanel');
      const prdPath = panel ? panel.dataset.prdPath : '';

      vscode.postMessage({
        command: 'createPRD',
        taskId: currentPrdTaskId,
        prdPath: prdPath
      });
    }

    // Edit current PRD
    function editPRD() {
      const panel = document.getElementById('prdPanel');
      const prdPath = panel ? panel.dataset.prdPath : '';

      if (!prdPath) return;

      vscode.postMessage({
        command: 'editPRD',
        prdPath: prdPath
      });
    }

    // Terminal Panel Functions
    function showTerminalPanel() {
      const terminalPanel = document.getElementById('terminalPanel');
      const board = document.getElementById('kanbanBoard');
      const prdPanel = document.getElementById('prdPanel');

      if (!terminalPanel || !board) return;

      // Add with-terminal class to board to adjust height
      board.classList.add('with-terminal');

      // Show terminal panel with animation (slides up from bottom)
      terminalPanel.style.display = 'flex';
      terminalPanel.style.visibility = 'visible';

      // Add with-sidebar class if PRD sidebar is visible
      if (prdPanel && prdPanel.getAttribute('data-visible') === 'true') {
        terminalPanel.classList.add('with-sidebar');
      }

      requestAnimationFrame(() => {
        terminalPanel.setAttribute('data-visible', 'true');
        terminalPanel.classList.remove('collapsed');
      });
    }

    function closeTerminal() {
      const terminalPanel = document.getElementById('terminalPanel');
      const board = document.getElementById('kanbanBoard');

      if (!terminalPanel || !board) return;

      // Remove with-terminal class from board
      board.classList.remove('with-terminal', 'collapsed-terminal');

      // Hide terminal panel with animation (slides down)
      terminalPanel.setAttribute('data-visible', 'false');
      terminalPanel.classList.remove('collapsed');

      setTimeout(() => {
        terminalPanel.style.display = 'none';
        terminalPanel.style.visibility = 'hidden';
      }, 300);
    }

    function toggleTerminal() {
      const terminalPanel = document.getElementById('terminalPanel');
      const board = document.getElementById('kanbanBoard');
      const toggleBtn = document.getElementById('terminalToggleBtn');

      if (!terminalPanel || !board) return;

      const isVisible = terminalPanel.getAttribute('data-visible') === 'true';
      const isCollapsed = terminalPanel.classList.contains('collapsed');

      if (!isVisible) {
        showTerminalPanel();
      } else if (isCollapsed) {
        // Expand
        terminalPanel.classList.remove('collapsed');
        board.classList.remove('collapsed-terminal');
        board.classList.add('with-terminal');
        if (toggleBtn) toggleBtn.textContent = '−';
      } else {
        // Collapse
        terminalPanel.classList.add('collapsed');
        board.classList.remove('with-terminal');
        board.classList.add('collapsed-terminal');
        if (toggleBtn) toggleBtn.textContent = '+';
      }
    }

    function clearTerminal() {
      const terminalContent = document.getElementById('terminalContent');
      if (terminalContent) {
        terminalContent.innerHTML = '<div class="terminal-output-line info">Terminal cleared.</div>';
      }
    }

    function appendToTerminal(content, type = 'info') {
      const terminalContent = document.getElementById('terminalContent');
      if (!terminalContent) return;

      // Show terminal if not visible
      const terminalPanel = document.getElementById('terminalPanel');
      if (terminalPanel && terminalPanel.getAttribute('data-visible') !== 'true') {
        showTerminalPanel();
      }

      // Create output line
      const line = document.createElement('div');
      line.className = `terminal-output-line ${type}`;
      line.textContent = content;

      terminalContent.appendChild(line);

      // Auto-scroll to bottom
      terminalContent.scrollTop = terminalContent.scrollHeight;
    }

    // Refresh handler
    function refresh() {
      // Add spinning animation to refresh buttons
      const refreshBtns = document.querySelectorAll('[onclick*="refresh()"]');
      refreshBtns.forEach(btn => btn.classList.add('refreshing'));

      // Remove spinning after refresh completes (via message or timeout)
      setTimeout(() => {
        refreshBtns.forEach(btn => btn.classList.remove('refreshing'));
      }, 1000);

      vscode.postMessage({ command: 'refresh' });
    }

    // Create task handler
    function createTask() {
      vscode.postMessage({ command: 'createTask' });
    }

    // ============ Batch Execution Functions ============
    let isBatchRunning = false;
    let batchProgress = { current: 0, total: 0, completed: 0, skipped: 0 };

    function toggleBatchExecution() {
      if (isBatchRunning) {
        cancelBatchExecution();
      } else {
        startBatchExecution();
      }
    }

    function startBatchExecution() {
      // Get all task IDs from "To Do" column
      const toDoColumn = document.querySelector('.column[data-status="To Do"]');
      if (!toDoColumn) return;

      const tasks = Array.from(toDoColumn.querySelectorAll('.task-card'));
      if (tasks.length === 0) {
        alert('No tasks in To Do column');
        return;
      }

      // Sort tasks by order (ascending), then by priority
      tasks.sort((a, b) => {
        const orderA = parseInt(a.dataset.order || '999999', 10);
        const orderB = parseInt(b.dataset.order || '999999', 10);

        // If both have order, sort by order
        if (orderA !== 999999 && orderB !== 999999) {
          if (orderA !== orderB) {
            return orderA - orderB;
          }
        } else if (orderA !== 999999) {
          // a has order, b doesn't - a comes first
          return -1;
        } else if (orderB !== 999999) {
          // b has order, a doesn't - b comes first
          return 1;
        }

        // Neither has order or same order - fallback to priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityA = a.classList.contains('high') ? 'high' :
                          a.classList.contains('medium') ? 'medium' : 'low';
        const priorityB = b.classList.contains('high') ? 'high' :
                          b.classList.contains('medium') ? 'medium' : 'low';
        return priorityOrder[priorityA] - priorityOrder[priorityB];
      });

      const taskIds = tasks.map(card => card.dataset.taskId);

      vscode.postMessage({
        command: 'startBatchExecution',
        taskIds: taskIds
      });
    }

    function cancelBatchExecution() {
      vscode.postMessage({
        command: 'cancelBatchExecution'
      });
    }

    function updateBatchUI(isRunning) {
      isBatchRunning = isRunning;

      const playAllBtn = document.querySelector('.play-all-btn');
      const progressBanner = document.getElementById('batchProgressBanner');

      if (playAllBtn) {
        playAllBtn.classList.toggle('running', isRunning);
        playAllBtn.innerHTML = isRunning ? '⏹ Stop All' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play All';
        playAllBtn.title = isRunning ? 'Cancel batch execution' : 'Execute all tasks via Claude CLI';
      }

      if (progressBanner) {
        progressBanner.style.display = isRunning ? 'flex' : 'none';
      }
    }

    function updateBatchProgress(current, total, completed, skipped) {
      batchProgress = { current, total, completed, skipped };

      const currentEl = document.getElementById('batchProgressCurrent');
      const totalEl = document.getElementById('batchProgressTotal');
      const completedEl = document.getElementById('batchCompleted');
      const skippedEl = document.getElementById('batchSkipped');

      if (currentEl) currentEl.textContent = current;
      if (totalEl) totalEl.textContent = total;
      if (completedEl) completedEl.textContent = completed;
      if (skippedEl) skippedEl.textContent = skipped;
    }
    // ============ End Batch Execution Functions ============

    // Open settings handler (PRD path config)
    function openSettings() {
      closeSettingsPanel();
      vscode.postMessage({ command: 'openSettings' });
    }

    // Open VS Code extension settings
    function openExtensionSettings() {
      vscode.postMessage({ command: 'openExtensionSettings' });
    }

    // Settings panel toggle
    function toggleSettingsPanel(event) {
      event.stopPropagation();
      const panel = document.getElementById('settingsPanel');
      if (panel) {
        panel.classList.toggle('open');
      }
    }

    function closeSettingsPanel() {
      const panel = document.getElementById('settingsPanel');
      if (panel) {
        panel.classList.remove('open');
      }
    }

    // Stop propagation on settings panel to prevent closing
    document.getElementById('settingsPanel').addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Close settings panel when clicking outside
    document.addEventListener('click', (e) => {
      const settingsBtn = e.target.closest('.settings-dropdown > button');
      if (settingsBtn) return; // Don't close when clicking the toggle button

      const settingsPanel = document.getElementById('settingsPanel');
      if (settingsPanel && !settingsPanel.contains(e.target)) {
        closeSettingsPanel();
      }
    });

    // Toggle column visibility instantly
    function toggleColumn(columnName, isVisible) {
      const column = document.querySelector(`.column[data-status="${columnName}"]`);
      if (column) {
        if (isVisible) {
          column.classList.remove('hidden');
        } else {
          column.classList.add('hidden');
        }
      }

      // Save to VS Code settings in background (don't wait)
      const enabledColumns = [];
      document.querySelectorAll('.column-toggle input[type="checkbox"]').forEach(checkbox => {
        if (checkbox.checked) {
          enabledColumns.push(checkbox.dataset.column);
        }
      });
      vscode.postMessage({
        command: 'saveColumnSettings',
        columns: enabledColumns
      });
    }

    // Sort change handler
    function onSortChange() {
      const sortSelect = document.getElementById('sortSelect');
      if (!(sortSelect instanceof HTMLSelectElement)) return;

      currentSortMode = sortSelect.value;

      switch (currentSortMode) {
        case 'priority-asc':
          sortTasksByPriority(true);
          break;
        case 'priority-desc':
          sortTasksByPriority(false);
          break;
        case 'name-asc':
          sortTasksByName(true);
          break;
        case 'name-desc':
          sortTasksByName(false);
          break;
        case 'default':
        default:
          sortTasksByDefault();
          break;
      }
    }

    function sortTasksByPriority(ascending) {
      const columns = document.querySelectorAll('.column');
      const priorityOrder = { high: 0, medium: 1, low: 2 };

      columns.forEach(column => {
        const content = column.querySelector('.column-content');
        if (!content) return;

        const tasks = Array.from(content.querySelectorAll('.task-card'));
        const emptyState = content.querySelector('.empty-state');

        if (tasks.length === 0) return;

        // Sort tasks by priority
        tasks.sort((a, b) => {
          // Get priority from class list (cards have classes: high, medium, or low)
          let aPriority = 'low';
          let bPriority = 'low';

          if (a.classList.contains('high')) {
            aPriority = 'high';
          } else if (a.classList.contains('medium')) {
            aPriority = 'medium';
          }

          if (b.classList.contains('high')) {
            bPriority = 'high';
          } else if (b.classList.contains('medium')) {
            bPriority = 'medium';
          }

          const diff = priorityOrder[aPriority] - priorityOrder[bPriority];
          return ascending ? diff : -diff;
        });

        // Store empty state node if it exists (detach it first)
        const emptyStateNode = emptyState ? emptyState.cloneNode(true) : null;

        // Remove all child nodes
        while (content.firstChild) {
          content.removeChild(content.firstChild);
        }

        // Re-append sorted tasks
        tasks.forEach(task => {
          content.appendChild(task);
        });

        // Re-append empty state if it existed
        if (emptyStateNode) {
          content.appendChild(emptyStateNode);
        }
      });
    }

    function sortTasksByName(ascending) {
      const columns = document.querySelectorAll('.column');

      columns.forEach(column => {
        const content = column.querySelector('.column-content');
        if (!content) return;

        const tasks = Array.from(content.querySelectorAll('.task-card'));
        const emptyState = content.querySelector('.empty-state');

        if (tasks.length === 0) return;

        // Sort tasks by name (from data-label or task title)
        tasks.sort((a, b) => {
          const aLabel = a.dataset.label || a.querySelector('.task-title')?.textContent || '';
          const bLabel = b.dataset.label || b.querySelector('.task-title')?.textContent || '';
          const comparison = aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
          return ascending ? comparison : -comparison;
        });

        // Store empty state node if it exists
        const emptyStateNode = emptyState ? emptyState.cloneNode(true) : null;

        // Remove all child nodes
        while (content.firstChild) {
          content.removeChild(content.firstChild);
        }

        // Re-append sorted tasks
        tasks.forEach(task => {
          content.appendChild(task);
        });

        // Re-append empty state if it existed
        if (emptyStateNode) {
          content.appendChild(emptyStateNode);
        }
      });
    }

    function sortTasksByDefault() {
      // Restore original order from stored map
      const columns = document.querySelectorAll('.column');

      columns.forEach(column => {
        const content = column.querySelector('.column-content');
        if (!content) return;

        const columnStatus = column.dataset.status;
        const originalOrder = originalTaskOrder.get(columnStatus);

        // Re-store order if not available (shouldn't happen, but just in case)
        if (!originalOrder || originalOrder.length === 0) {
          storeOriginalOrder();
          const updatedOrder = originalTaskOrder.get(columnStatus);
          if (!updatedOrder || updatedOrder.length === 0) {
            return; // Still no order, skip this column
          }
          // Use the newly stored order
          const tasks = Array.from(content.querySelectorAll('.task-card'));
          if (tasks.length === 0) return;
          tasks.sort((a, b) => {
            const aId = a.dataset.taskId;
            const bId = b.dataset.taskId;
            const aIndex = updatedOrder.indexOf(aId);
            const bIndex = updatedOrder.indexOf(bId);
            return aIndex - bIndex;
          });
          const emptyState = content.querySelector('.empty-state');
          const emptyStateNode = emptyState ? emptyState.cloneNode(true) : null;
          while (content.firstChild) {
            content.removeChild(content.firstChild);
          }
          tasks.forEach(task => content.appendChild(task));
          if (emptyStateNode) content.appendChild(emptyStateNode);
          return;
        }

        const tasks = Array.from(content.querySelectorAll('.task-card'));
        const emptyState = content.querySelector('.empty-state');

        if (tasks.length === 0) return;

        // Sort tasks back to original order
        tasks.sort((a, b) => {
          const aId = a.dataset.taskId;
          const bId = b.dataset.taskId;
          const aIndex = originalOrder.indexOf(aId);
          const bIndex = originalOrder.indexOf(bId);
          return aIndex - bIndex;
        });

        // Store empty state node if it exists
        const emptyStateNode = emptyState ? emptyState.cloneNode(true) : null;

        // Remove all child nodes
        while (content.firstChild) {
          content.removeChild(content.firstChild);
        }

        // Re-append tasks in original order
        tasks.forEach(task => {
          content.appendChild(task);
        });

        // Re-append empty state if it existed
        if (emptyStateNode) {
          content.appendChild(emptyStateNode);
        }
      });
    }

    // Store original task order (call after DOM is ready)
    function storeOriginalOrder() {
      const columns = document.querySelectorAll('.column');
      originalTaskOrder.clear(); // Clear old order
      columns.forEach(column => {
        const content = column.querySelector('.column-content');
        if (!content) return;
        const columnStatus = column.dataset.status;
        const tasks = Array.from(content.querySelectorAll('.task-card'));
        const taskIds = tasks.map(task => task.dataset.taskId);
        if (taskIds.length > 0) {
          originalTaskOrder.set(columnStatus, taskIds);
        }
      });
    }

    // Store original order when page loads (use DOMContentLoaded or setTimeout)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => storeOriginalOrder(), 50);
      });
    } else {
      setTimeout(() => storeOriginalOrder(), 50);
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'updatePRDContent': {
          const panel = document.getElementById('prdPanel');
          const board = document.getElementById('kanbanBoard');
          const content = document.getElementById('prdContent');
          const terminalPanel = document.getElementById('terminalPanel');
          const editBtn = document.getElementById('editPrdBtn');
          const createBtn = document.getElementById('createPrdBtn');

          if (panel && content) {
            // Ensure sidebar is visible when content is updated
            panel.style.display = 'flex';
            panel.style.visibility = 'visible';
            if (board) {
              board.classList.add('with-prd-sidebar');
            }
            requestAnimationFrame(() => {
              panel.setAttribute('data-visible', 'true');
            });
            content.innerHTML = `<div class="prd-markdown">${message.content}</div>`;

            // Show/hide create/edit buttons based on PRD existence
            if (editBtn && createBtn) {
              if (message.prdExists) {
                editBtn.style.display = 'inline-flex';
                createBtn.style.display = 'none';
              } else {
                editBtn.style.display = 'none';
                createBtn.style.display = 'inline-flex';
              }
            }

            // Store current PRD path for edit function
            panel.dataset.prdPath = message.prdPath || '';

            // Update terminal panel positioning if visible
            if (terminalPanel && terminalPanel.getAttribute('data-visible') === 'true') {
              terminalPanel.classList.add('with-sidebar');
            }
          }
          break;
        }

        case 'availableProviders': {
          availableProviders = message.providers || [];
          const select = document.getElementById('providerSelect');
          const warning = document.getElementById('noProvidersWarning');
          const selectGroup = document.getElementById('providerSelectGroup');

          if (availableProviders.length === 0) {
            warning.style.display = 'block';
            selectGroup.style.display = 'none';
          } else {
            warning.style.display = 'none';
            selectGroup.style.display = 'block';
            select.innerHTML = '<option value="">Select a provider...</option>' +
              availableProviders.map(p =>
                `<option value="${p.type}">${p.name}${p.enabled ? '' : ' (not configured)'}</option>`
              ).join('');
          }
          break;
        }

        case 'updateModelsForProvider': {
          availableModels = message.models || [];
          const select = document.getElementById('modelSelect');
          const sendBtn = document.getElementById('sendToAgentBtn');

          if (availableModels.length === 0) {
            select.innerHTML = '<option value="">No models available</option>';
            sendBtn.disabled = true;
          } else {
            select.innerHTML = availableModels.map(m =>
              `<option value="${m.id}">${m.name} ($${m.inputPrice}/M in, $${m.outputPrice}/M out)</option>`
            ).join('');
            select.onchange = onModelChange;
            // Auto-select first model
            if (availableModels.length > 0) {
              select.value = availableModels[0].id;
              sendBtn.disabled = false;
            }
          }
          break;
        }

        case 'agentSendSuccess': {
          hideAgentModal();
          // Refresh to show updated task status
          refresh();
          break;
        }

        case 'agentSendError': {
          const btn = document.getElementById('sendToAgentBtn');
          btn.disabled = false;
          btn.textContent = 'Send to Agent';
          alert('Error: ' + (message.error || 'Failed to send to agent'));
          break;
        }

        case 'agentStatusUpdate': {
          // Update task card with new agent status
          const card = document.querySelector(`[data-task-id="${message.taskId}"]`);
          if (card) {
            // Remove old status classes
            card.classList.remove('agent-pending', 'agent-running', 'agent-completed', 'agent-error');
            // Add new status class
            card.classList.add(`agent-${message.status}`);
          }
          break;
        }

        case 'ralphCommandExecuted': {
          hideAgentModal();
          showTerminalPanel();
          appendToTerminal('✅ Ralph command executed successfully', 'success');
          appendToTerminal(message.command || 'Command executed', 'info');
          break;
        }

        case 'ralphCommandError': {
          const btn = document.getElementById('sendToAgentBtn');
          btn.disabled = false;
          btn.textContent = 'Execute with Ralph';
          const errorMsg = message.error || 'Failed to execute ralph command';
          showTerminalPanel();
          appendToTerminal(`❌ Ralph command error: ${errorMsg}`, 'error');
          alert('Error: ' + errorMsg);
          break;
        }

        case 'claudeExecutionStarted': {
          runningTasks.add(message.taskId);
          updateTaskRunningState(message.taskId, true);
          showTerminalPanel();
          appendToTerminal(`✅ Execution started for task: ${message.taskId}`, 'success');
          break;
        }

        case 'claudeExecutionStopped': {
          runningTasks.delete(message.taskId);
          updateTaskRunningState(message.taskId, false);
          appendToTerminal(`⏹ Execution stopped for task: ${message.taskId}`, 'info');
          break;
        }

        case 'claudeExecutionError': {
          runningTasks.delete(message.taskId);
          updateTaskRunningState(message.taskId, false);
          const errorMsg = message.error || 'Unknown error';
          appendToTerminal(`❌ Execution failed: ${errorMsg}`, 'error');
          alert('Claude execution failed: ' + errorMsg);
          break;
        }

        case 'terminalOutput': {
          const outputType = message.type || 'info';
          appendToTerminal(message.content, outputType);
          break;
        }

        // Rate limit message handlers
        case 'rateLimitCountdownStart': {
          startRateLimitCountdown(message.taskId, message.waitSeconds);
          break;
        }

        case 'rateLimitRetrying': {
          clearRateLimitUI();
          runningTasks.add(message.taskId);
          updateTaskRunningState(message.taskId, true);
          break;
        }

        // ============ Batch Execution Message Handlers ============
        case 'batchExecutionStarted': {
          updateBatchUI(true);
          updateBatchProgress(0, message.total, 0, 0);
          showTerminalPanel();
          appendToTerminal(`🚀 Starting batch execution: ${message.total} tasks`, 'info');
          appendToTerminal('---', 'info');
          break;
        }

        case 'batchTaskStarted': {
          // Highlight the current task being executed
          const card = document.querySelector(`[data-task-id="${message.taskId}"]`);
          if (card) {
            card.classList.add('running');
            const taskName = card.dataset.label || message.taskId;
            appendToTerminal(`▶ Starting task [${message.index + 1}/${message.total}]: ${taskName}`, 'info');
          }
          updateBatchProgress(message.index + 1, message.total, batchProgress.completed, batchProgress.skipped);
          break;
        }

        case 'batchTaskCompleted': {
          // Remove running state from task
          const taskCard = document.querySelector(`[data-task-id="${message.taskId}"]`);
          if (taskCard) {
            taskCard.classList.remove('running');
            const taskName = taskCard.dataset.label || message.taskId;
            if (message.success) {
              taskCard.classList.add('agent-completed');
              appendToTerminal(`✅ Completed: ${taskName}`, 'success');
              batchProgress.completed++;
            } else {
              appendToTerminal(`⏭ Skipped: ${taskName}`, 'info');
              batchProgress.skipped++;
            }
          }

          updateBatchProgress(batchProgress.current, batchProgress.total, batchProgress.completed, batchProgress.skipped);
          break;
        }

        case 'batchExecutionProgress': {
          updateBatchProgress(message.current, message.total, message.completed, message.skipped);
          appendToTerminal(`📊 Progress: ${message.current}/${message.total} (Completed: ${message.completed}, Skipped: ${message.skipped})`, 'info');
          break;
        }

        case 'batchExecutionComplete': {
          updateBatchUI(false);
          appendToTerminal('---', 'info');
          appendToTerminal(`🎉 Batch execution complete!`, 'success');
          appendToTerminal(`   Completed: ${message.completed}`, 'success');
          appendToTerminal(`   Skipped: ${message.skipped}`, 'info');
          alert(`Batch complete!\n\nCompleted: ${message.completed}\nSkipped: ${message.skipped}`);
          refresh(); // Refresh to update task positions
          break;
        }

        case 'batchExecutionCancelled': {
          updateBatchUI(false);
          appendToTerminal('---', 'info');
          appendToTerminal(`⚠️ Batch execution cancelled`, 'error');
          appendToTerminal(`   Completed: ${message.completed}`, 'info');
          appendToTerminal(`   Remaining: ${message.total - message.current}`, 'info');
          alert(`Batch cancelled.\n\nCompleted: ${message.completed}\nRemaining: ${message.total - message.current}`);
          refresh();
          break;
        }
        // ============ End Batch Execution Message Handlers ============
      }
    });
