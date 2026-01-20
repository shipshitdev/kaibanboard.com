const vscode = acquireVsCodeApi();
let draggedElement = null;
let isDragging = false;
let currentSortMode = "default"; // 'default', 'priority-asc', 'priority-desc'
const originalTaskOrder = new Map(); // Store original order of tasks per column

// Claude execution state
let currentPrdTaskId = null;
const runningTasks = new Set(); // Track task IDs that are currently executing
const reviewingTasks = new Set(); // Track task IDs that are currently being reviewed

// Claude quota functions
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function refreshClaudeQuota() {
  const refreshBtn = document.querySelector("#quotaWidget .quota-refresh-btn");
  if (refreshBtn) {
    refreshBtn.classList.add("refreshing");
  }
  vscode.postMessage({ command: "refreshClaudeQuota" });
}

// Codex quota functions
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function refreshCodexQuota() {
  const refreshBtn = document.querySelector("#codexQuotaWidget .quota-refresh-btn");
  if (refreshBtn) {
    refreshBtn.classList.add("refreshing");
  }
  vscode.postMessage({ command: "refreshCodexQuota" });
}

function updateCodexQuotaUI(data) {
  const loading = document.getElementById("codexQuotaLoading");
  const content = document.getElementById("codexQuotaContent");
  const error = document.getElementById("codexQuotaError");
  const refreshBtn = document.querySelector("#codexQuotaWidget .quota-refresh-btn");

  // Remove refreshing state
  if (refreshBtn) {
    refreshBtn.classList.remove("refreshing");
  }

  if (!data.isAvailable) {
    // Codex not available - hide widget entirely
    const widget = document.getElementById("codexQuotaWidget");
    if (widget) widget.style.display = "none";
    return;
  }

  // Show widget
  const widget = document.getElementById("codexQuotaWidget");
  if (widget) widget.style.display = "flex";

  if (data.error && !data.usage) {
    // Error state without data
    if (loading) loading.style.display = "none";
    if (content) content.style.display = "none";
    if (error) {
      error.style.display = "flex";
      document.getElementById("codexQuotaErrorText").textContent = data.error;
    }
    return;
  }

  if (data.usage) {
    // Show data
    if (loading) loading.style.display = "none";
    if (error) error.style.display = "none";
    if (content) content.style.display = "flex";

    // Update 5-hour session bar (utilization is already a percentage 0-100)
    const fill5h = document.getElementById("codexQuota5h");
    const value5h = document.getElementById("codexQuota5hValue");
    if (data.usage.sessionLimit) {
      const percent5h = Math.round(data.usage.sessionLimit.utilization);
      if (fill5h) {
        fill5h.style.width = `${Math.min(percent5h, 100)}%`;
        fill5h.dataset.status = data.usage.sessionLimit.status;
      }
      if (value5h) {
        value5h.textContent = `${percent5h}%`;
        value5h.dataset.status = data.usage.sessionLimit.status;
      }
    } else {
      if (fill5h) fill5h.style.width = "0%";
      if (value5h) value5h.textContent = "N/A";
    }

    // Update 7-day bar
    const fill7d = document.getElementById("codexQuota7d");
    const value7d = document.getElementById("codexQuota7dValue");
    if (data.usage.weeklyLimit) {
      const percent7d = Math.round(data.usage.weeklyLimit.utilization);
      if (fill7d) {
        fill7d.style.width = `${Math.min(percent7d, 100)}%`;
        fill7d.dataset.status = data.usage.weeklyLimit.status;
      }
      if (value7d) {
        value7d.textContent = `${percent7d}%`;
        value7d.dataset.status = data.usage.weeklyLimit.status;
      }
    } else {
      if (fill7d) fill7d.style.width = "0%";
      if (value7d) value7d.textContent = "N/A";
    }

    // Update Code Review bar if available
    const reviewGroup = document.getElementById("codexReviewGroup");
    if (data.usage.codeReviewLimit && reviewGroup) {
      reviewGroup.classList.add("visible");
      const fillReview = document.getElementById("codexQuotaReview");
      const valueReview = document.getElementById("codexQuotaReviewValue");
      const percentReview = Math.round(data.usage.codeReviewLimit.utilization);
      if (fillReview) {
        fillReview.style.width = `${Math.min(percentReview, 100)}%`;
        fillReview.dataset.status = data.usage.codeReviewLimit.status;
      }
      if (valueReview) {
        valueReview.textContent = `${percentReview}%`;
        valueReview.dataset.status = data.usage.codeReviewLimit.status;
      }
    } else if (reviewGroup) {
      reviewGroup.classList.remove("visible");
    }

    // Update tooltips with reset times
    const quotaPrimary = document.querySelector("#codexQuotaWidget .quota-primary");
    if (quotaPrimary) {
      let tooltip = `Codex CLI Usage (${data.usage.planType})`;
      if (data.usage.sessionLimit) {
        tooltip += `\n5h: ${Math.round(data.usage.sessionLimit.utilization)}% (resets ${data.usage.sessionLimit.resetTimeFormatted})`;
      }
      if (data.usage.weeklyLimit) {
        tooltip += `\n7d: ${Math.round(data.usage.weeklyLimit.utilization)}% (resets ${data.usage.weeklyLimit.resetTimeFormatted})`;
      }
      if (data.usage.codeReviewLimit) {
        tooltip += `\nReview: ${Math.round(data.usage.codeReviewLimit.utilization)}% (resets ${data.usage.codeReviewLimit.resetTimeFormatted})`;
      }
      tooltip += "\n\nHover to see all limits";
      quotaPrimary.title = tooltip;
    }
  }
}

function updateQuotaUI(data) {
  const loading = document.getElementById("quotaLoading");
  const content = document.getElementById("quotaContent");
  const error = document.getElementById("quotaError");
  const refreshBtn = document.querySelector(".quota-refresh-btn");

  // Remove refreshing state
  if (refreshBtn) {
    refreshBtn.classList.remove("refreshing");
  }

  if (!data.isMacOS) {
    // Not macOS - show nothing or minimal message
    if (loading) loading.style.display = "none";
    if (content) content.style.display = "none";
    if (error) {
      error.style.display = "flex";
      document.getElementById("quotaErrorText").textContent = "macOS only";
    }
    return;
  }

  if (data.error && !data.usage) {
    // Error state without data
    if (loading) loading.style.display = "none";
    if (content) content.style.display = "none";
    if (error) {
      error.style.display = "flex";
      document.getElementById("quotaErrorText").textContent = data.error;
    }
    return;
  }

  if (data.usage) {
    // Show data
    if (loading) loading.style.display = "none";
    if (error) error.style.display = "none";
    if (content) content.style.display = "flex";

    // Update 5-hour bar (utilization is already a percentage 0-100)
    const fill5h = document.getElementById("quota5h");
    const value5h = document.getElementById("quota5hValue");
    const percent5h = Math.round(data.usage.fiveHour.utilization);
    if (fill5h) {
      fill5h.style.width = `${Math.min(percent5h, 100)}%`;
      fill5h.dataset.status = data.usage.fiveHour.status;
    }
    if (value5h) {
      value5h.textContent = `${percent5h}%`;
      value5h.dataset.status = data.usage.fiveHour.status;
    }

    // Update 7-day bar
    const fill7d = document.getElementById("quota7d");
    const value7d = document.getElementById("quota7dValue");
    const percent7d = Math.round(data.usage.sevenDay.utilization);
    if (fill7d) {
      fill7d.style.width = `${Math.min(percent7d, 100)}%`;
      fill7d.dataset.status = data.usage.sevenDay.status;
    }
    if (value7d) {
      value7d.textContent = `${percent7d}%`;
      value7d.dataset.status = data.usage.sevenDay.status;
    }

    // Update Sonnet bar if available
    const sonnetGroup = document.getElementById("quotaSonnetGroup");
    if (data.usage.sevenDaySonnet && sonnetGroup) {
      sonnetGroup.classList.add("visible");
      const fillSonnet = document.getElementById("quotaSonnet");
      const valueSonnet = document.getElementById("quotaSonnetValue");
      const percentSonnet = Math.round(data.usage.sevenDaySonnet.utilization);
      if (fillSonnet) {
        fillSonnet.style.width = `${Math.min(percentSonnet, 100)}%`;
        fillSonnet.dataset.status = data.usage.sevenDaySonnet.status;
      }
      if (valueSonnet) {
        valueSonnet.textContent = `${percentSonnet}%`;
        valueSonnet.dataset.status = data.usage.sevenDaySonnet.status;
      }
    } else if (sonnetGroup) {
      sonnetGroup.classList.remove("visible");
    }

    // Update tooltips with reset times
    const quotaPrimary = document.querySelector(".quota-primary");
    const group7d = document.querySelector('.quota-bar-group[title*="7-day weekly"]');
    if (quotaPrimary) {
      let tooltip = `5h: ${percent5h}% (resets ${data.usage.fiveHour.resetTimeFormatted})`;
      tooltip += `\n7d: ${percent7d}% (resets ${data.usage.sevenDay.resetTimeFormatted})`;
      if (data.usage.sevenDaySonnet) {
        const percentSonnet = Math.round(data.usage.sevenDaySonnet.utilization);
        tooltip += `\nSonnet: ${percentSonnet}% (resets ${data.usage.sevenDaySonnet.resetTimeFormatted})`;
      }
      tooltip += "\n\nHover to see all limits";
      quotaPrimary.title = tooltip;
    }
    if (group7d) {
      group7d.title = `7-day weekly limit: ${percent7d}% used\nResets in ${data.usage.sevenDay.resetTimeFormatted}`;
    }
  }
}

// Rate limit state
let rateLimitTaskId = null;
let rateLimitEndTime = null;
let rateLimitInterval = null;

// Rate limit functions
function startRateLimitCountdown(taskId, waitSeconds) {
  rateLimitTaskId = taskId;
  rateLimitEndTime = Date.now() + waitSeconds * 1000;

  // Get task name
  const card = document.querySelector(`[data-task-id="${taskId}"]`);
  const taskName = card ? card.dataset.label : "Unknown task";
  document.getElementById("rateLimitTaskName").textContent = taskName;

  // Show banner
  document.getElementById("rateLimitBanner").classList.add("active");
  document.body.classList.add("has-rate-limit-banner");

  // Update task card to show rate-limited state
  if (card) {
    card.classList.remove("running");
    card.classList.add("rate-limited");
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

  const timerStr = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  document.getElementById("rateLimitTimer").textContent = timerStr;

  if (remaining <= 0) {
    // Timer expired - will be handled by extension auto-retry
    clearRateLimitUI();
  }
}

function _retryRateLimitNow() {
  if (rateLimitTaskId) {
    vscode.postMessage({
      command: "retryAfterRateLimit",
      taskId: rateLimitTaskId,
    });
    clearRateLimitUI();
  }
}

function _cancelRateLimitWait() {
  if (rateLimitTaskId) {
    vscode.postMessage({
      command: "stopClaudeExecution",
      taskId: rateLimitTaskId,
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
  document.getElementById("rateLimitBanner").classList.remove("active");
  document.body.classList.remove("has-rate-limit-banner");

  // Clear task card state
  if (rateLimitTaskId) {
    const card = document.querySelector(`[data-task-id="${rateLimitTaskId}"]`);
    if (card) {
      card.classList.remove("rate-limited");
    }
  }

  rateLimitTaskId = null;
  rateLimitEndTime = null;
}

function _triggerRateLimitFromUI(taskId) {
  // Allow user to manually trigger rate limit wait from task card
  const waitMinutes = prompt("Enter wait time in minutes:", "5");
  if (waitMinutes && !Number.isNaN(parseInt(waitMinutes, 10))) {
    const waitSeconds = parseInt(waitMinutes, 10) * 60;
    vscode.postMessage({
      command: "triggerRateLimitWait",
      taskId: taskId,
      waitSeconds: waitSeconds,
    });
  }
}

// Claude CLI execution functions
function toggleExecution(taskId) {
  if (runningTasks.has(taskId)) {
    // Stop the execution
    appendToTerminal(`Stopping execution for task ${taskId}...`, "info");
    vscode.postMessage({
      command: "stopClaudeExecution",
      taskId: taskId,
    });
  } else {
    // Start the execution - show terminal and log start
    showTerminalPanel();
    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    const taskName = card ? card.dataset.label : taskId;
    appendToTerminal(`Starting execution: ${taskName}`, "info");
    appendToTerminal(`Task ID: ${taskId}`, "info");
    appendToTerminal("---", "info");

    vscode.postMessage({
      command: "executeViaClaude",
      taskId: taskId,
    });
  }
}

// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function executePRD() {
  if (currentPrdTaskId) {
    toggleExecution(currentPrdTaskId);
  }
}

function updateTaskRunningState(taskId, isRunning) {
  const card = document.querySelector(`[data-task-id="${taskId}"]`);
  if (card) {
    card.classList.toggle("running", isRunning);
    const btn = card.querySelector(".play-stop-btn");
    if (btn) {
      btn.classList.toggle("running", isRunning);
      btn.innerHTML = isRunning ? "⏹" : "▶";
      btn.title = isRunning ? "Stop execution" : "Execute via Claude";
    }
    // Clear progress when task stops running
    if (!isRunning) {
      clearTaskProgress(taskId);
    }
  }

  // Also update PRD panel button if this task is selected
  if (currentPrdTaskId === taskId) {
    const prdBtn = document.getElementById("playPrdBtn");
    if (prdBtn) {
      prdBtn.innerHTML = isRunning ? "⏹ Stop" : "▶ Execute";
      prdBtn.classList.toggle("running", isRunning);
    }
  }
}

// Update task progress indicator with current tool/step
function updateTaskProgress(taskId, toolName, status) {
  const card = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!card) return;

  // Get or create progress element
  let progressEl = card.querySelector(".claude-progress");
  if (!progressEl) {
    progressEl = document.createElement("div");
    progressEl.className = "claude-progress";
    progressEl.innerHTML = `
          <span class="progress-tool-name"></span>
          <span class="progress-status"></span>
        `;
    card.appendChild(progressEl);
  }

  // Update content
  const toolNameEl = progressEl.querySelector(".progress-tool-name");
  const statusEl = progressEl.querySelector(".progress-status");

  if (toolNameEl) {
    toolNameEl.textContent = toolName || "";
    toolNameEl.style.display = toolName ? "inline" : "none";
  }
  if (statusEl) {
    statusEl.textContent = status || "Working...";
  }

  // Show progress element
  progressEl.style.display = "flex";
}

// Clear task progress indicator
function clearTaskProgress(taskId) {
  const card = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!card) return;

  const progressEl = card.querySelector(".claude-progress");
  if (progressEl) {
    progressEl.style.display = "none";
  }
}

// Update review badge for a task in AI Review column
function updateReviewBadge(taskId, status, rating) {
  const card = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!card) return;

  // Find existing review badge or create one
  let badge = card.querySelector(".review-badge");

  // Determine badge content based on status
  let badgeClass = "pending";
  let badgeText = "⏳ Pending";
  let dataStatus = "pending";

  switch (status) {
    case "in_progress":
      badgeClass = "reviewing";
      badgeText = "⟳ Reviewing";
      dataStatus = "in_progress";
      break;
    case "completed":
      if (rating === "pass") {
        badgeClass = "passed";
        badgeText = "✓ Passed";
        dataStatus = "passed";
      } else if (rating === "critical_issues") {
        badgeClass = "failed";
        badgeText = "✗ Issues";
        dataStatus = "critical_issues";
      } else {
        badgeClass = "needs-work";
        badgeText = "⚠ Needs Work";
        dataStatus = "needs_work";
      }
      break;
    case "failed":
      badgeClass = "failed";
      badgeText = "✗ Failed";
      dataStatus = "failed";
      break;
  }

  if (badge) {
    // Update existing badge
    badge.className = `badge review-badge ${badgeClass}`;
    badge.textContent = badgeText;
    badge.dataset.reviewStatus = dataStatus;
  } else {
    // Create new badge if we're in AI Review column
    if (card.dataset.status === "AI Review") {
      const taskMeta = card.querySelector(".task-meta");
      if (taskMeta) {
        badge = document.createElement("span");
        badge.className = `badge review-badge ${badgeClass}`;
        badge.textContent = badgeText;
        badge.dataset.reviewStatus = dataStatus;
        taskMeta.appendChild(badge);
      }
    }
  }
}

// Update task running state considering both terminal execution and review
function updateCombinedRunningState(taskId) {
  const isRunning = runningTasks.has(taskId) || reviewingTasks.has(taskId);
  updateTaskRunningState(taskId, isRunning);
}

// Confirmation modal for stopping execution
const stopExecutionCallbacks = { onConfirm: null, onCancel: null };

function showStopExecutionModal(taskId, onConfirm, onCancel) {
  const modal = document.getElementById("stopExecutionModal");
  const taskCard = document.querySelector(`[data-task-id="${taskId}"]`);
  const taskName = taskCard ? taskCard.dataset.label : "this task";

  // Set task name in modal
  const taskNameElement = document.getElementById("stopExecutionTaskName");
  if (taskNameElement) {
    taskNameElement.textContent = taskName;
  }

  // Store callbacks
  stopExecutionCallbacks.onConfirm = onConfirm;
  stopExecutionCallbacks.onCancel = onCancel;

  // Show modal
  if (modal) {
    modal.style.display = "flex";
  } else {
    // Fallback if modal doesn't exist - just confirm
    onConfirm();
  }
}

function hideStopExecutionModal() {
  const modal = document.getElementById("stopExecutionModal");
  if (modal) {
    modal.style.display = "none";
  }
  // Clear callbacks
  stopExecutionCallbacks.onConfirm = null;
  stopExecutionCallbacks.onCancel = null;
}

// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function confirmStopExecution() {
  if (stopExecutionCallbacks.onConfirm) {
    hideStopExecutionModal();
    stopExecutionCallbacks.onConfirm();
  }
}

function cancelStopExecution() {
  if (stopExecutionCallbacks.onCancel) {
    hideStopExecutionModal();
    stopExecutionCallbacks.onCancel();
  }
}

// PRD edit state
let isPrdEditMode = false;
let currentPrdPath = "";

// PRD edit functions
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function togglePrdEditMode() {
  const panel = document.getElementById("prdPanel");
  const prdPath = panel ? panel.dataset.prdPath : "";

  if (!prdPath) {
    alert("No PRD to edit");
    return;
  }

  if (!isPrdEditMode) {
    // Enter edit mode - request raw content
    currentPrdPath = prdPath;
    vscode.postMessage({
      command: "getPrdRawContent",
      prdPath: prdPath,
    });
  } else {
    // Exit edit mode
    cancelPrdEdit();
  }
}

function enterPrdEditMode(content) {
  isPrdEditMode = true;

  const editContainer = document.getElementById("prdEditContainer");
  const prdContent = document.getElementById("prdContent");
  const headerTitle = document.getElementById("prdHeaderTitle");
  const textarea = document.getElementById("prdEditTextarea");

  // View mode buttons
  const editBtn = document.getElementById("editPrdBtn");
  const playBtn = document.getElementById("playPrdBtn");
  // Edit mode buttons
  const cancelBtn = document.getElementById("cancelPrdBtn");
  const saveBtn = document.getElementById("savePrdBtn");

  // Populate textarea with raw markdown
  textarea.value = content;

  // Show edit container, hide PRD content
  editContainer.style.display = "flex";
  prdContent.style.display = "none";
  headerTitle.textContent = "Edit PRD";

  // Hide view mode buttons, show edit mode buttons
  if (editBtn) editBtn.style.display = "none";
  if (playBtn) playBtn.style.display = "none";
  if (cancelBtn) cancelBtn.style.display = "inline-flex";
  if (saveBtn) saveBtn.style.display = "inline-flex";
}

function cancelPrdEdit() {
  isPrdEditMode = false;

  const editContainer = document.getElementById("prdEditContainer");
  const prdContent = document.getElementById("prdContent");
  const headerTitle = document.getElementById("prdHeaderTitle");

  // View mode buttons
  const editBtn = document.getElementById("editPrdBtn");
  const playBtn = document.getElementById("playPrdBtn");
  // Edit mode buttons
  const cancelBtn = document.getElementById("cancelPrdBtn");
  const saveBtn = document.getElementById("savePrdBtn");

  editContainer.style.display = "none";
  prdContent.style.display = "block";
  headerTitle.textContent = "PRD Preview";

  // Show view mode buttons, hide edit mode buttons
  if (editBtn) editBtn.style.display = "inline-flex";
  if (playBtn && currentPrdTaskId) playBtn.style.display = "inline-flex";
  if (cancelBtn) cancelBtn.style.display = "none";
  if (saveBtn) saveBtn.style.display = "none";
}

// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function savePrdEdit() {
  if (!currentPrdPath) return;

  const textarea = document.getElementById("prdEditTextarea");
  const content = textarea.value;

  vscode.postMessage({
    command: "savePrdContent",
    prdPath: currentPrdPath,
    content: content,
  });
}

// Click handler for stop execution modal overlay
const stopExecutionModal = document.getElementById("stopExecutionModal");
if (stopExecutionModal) {
  stopExecutionModal.addEventListener("click", (e) => {
    if (e.target.id === "stopExecutionModal") {
      cancelStopExecution();
    }
  });
}

// Click handler for task cards
document.addEventListener("click", (e) => {
  // Ignore clicks if we just finished dragging
  if (isDragging) {
    return;
  }

  // Check if clicking on a link within PRD content first
  const link = e.target.closest("a");
  if (link?.closest("#prdContent")) {
    e.preventDefault();
    e.stopPropagation();
    const href = link.getAttribute("href");

    // Check if it's a relative path (not http/https/mailto)
    if (href && !href.match(/^(https?:|mailto:|#)/)) {
      // Load this file in the PRD preview
      // Try to get task file path from the PRD content's context
      const prdCard = link.closest(".task-card");
      const taskFilePath = prdCard ? prdCard.dataset.filepath : undefined;
      vscode.postMessage({
        command: "loadPRD",
        prdPath: href,
        taskFilePath: taskFilePath,
      });
    } else if (href?.match(/^https?:/)) {
      // External links should open in browser
      return true;
    }
    return false;
  }

  const card = e.target.closest(".task-card");
  if (card) {
    // Get PRD path - handle both camelCase (dataset.prdPath) and kebab-case (getAttribute)
    const prdPath = card.dataset.prdPath || card.getAttribute("data-prd-path") || "";

    // Debug logging
    console.log("Task clicked - PRD path:", prdPath);
    console.log("Task card data:", {
      prdPath: card.dataset.prdPath,
      prdPathAttr: card.getAttribute("data-prd-path"),
      filepath: card.dataset.filepath,
      taskId: card.dataset.taskId,
    });

    // Remove selection from all cards
    document.querySelectorAll(".task-card").forEach((c) => {
      c.classList.remove("selected");
    });

    // Select current card
    card.classList.add("selected");

    // Always show PRD panel when task is selected
    const board = document.getElementById("kanbanBoard");
    const panel = document.getElementById("prdPanel");
    const prdContent = document.getElementById("prdContent");

    // Always show the panel first
    if (board && panel) {
      board.classList.add("with-prd-sidebar");
      panel.style.display = "flex";
      panel.style.visibility = "visible";
      requestAnimationFrame(() => {
        panel.setAttribute("data-visible", "true");
      });

      // Update terminal panel positioning if visible
      const terminalPanel = document.getElementById("terminalPanel");
      if (terminalPanel && terminalPanel.getAttribute("data-visible") === "true") {
        terminalPanel.classList.add("with-sidebar");
      }

      // Show edit task button
      const editPrdBtn = document.getElementById("editPrdBtn");
      if (editPrdBtn) {
        editPrdBtn.style.display = "inline-block";
      }

      // Cancel any active edit mode when switching tasks
      if (isPrdEditMode) {
        cancelPrdEdit();
      }
    }

    // If PRD path exists and is not empty, load it
    if (prdPath && prdPath.trim() !== "") {
      console.log("Loading PRD:", prdPath);
      showPRDPreview(prdPath);
    } else {
      // If no PRD, show placeholder
      if (prdContent) {
        prdContent.innerHTML = '<div class="prd-placeholder">This task has no PRD linked</div>';
      }
    }
  }
});

// Double-click handler for task cards (opens file)
document.addEventListener("dblclick", (e) => {
  const card = e.target.closest(".task-card");
  if (card) {
    const filePath = card.dataset.filepath;
    if (filePath) {
      vscode.postMessage({
        command: "openTask",
        filePath: filePath,
      });
    }
  }
});

// Drag and drop handlers
document.addEventListener("dragstart", (e) => {
  const card = e.target.closest(".task-card");
  if (card) {
    isDragging = true;
    draggedElement = card;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", card.innerHTML);
  }
});

document.addEventListener("dragend", (e) => {
  const card = e.target.closest(".task-card");
  if (card) {
    card.classList.remove("dragging");
    draggedElement = null;
  }
  // Remove drag-over class from all columns
  document.querySelectorAll(".column").forEach((col) => {
    col.classList.remove("drag-over");
  });
  // Reset dragging flag after a short delay to allow drop event to process
  setTimeout(() => {
    isDragging = false;
  }, 100);
});

document.addEventListener("dragover", (e) => {
  e.preventDefault();
  const column = e.target.closest(".column");
  if (column && draggedElement) {
    e.dataTransfer.dropEffect = "move";
    // Add visual feedback
    document.querySelectorAll(".column").forEach((col) => {
      col.classList.remove("drag-over");
    });
    column.classList.add("drag-over");
  }
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
  const column = e.target.closest(".column");

  if (column && draggedElement) {
    const newStatus = column.dataset.status;
    const taskId = draggedElement.dataset.taskId;
    const currentStatus = draggedElement.dataset.status;

    // Get the column-content container where task cards live
    const columnContent = column.querySelector(".column-content");
    if (!columnContent) return;

    // Calculate new order based on drop position
    // First, temporarily move the element to the correct position in DOM
    const dropTarget = e.target.closest(".task-card");
    if (dropTarget && dropTarget !== draggedElement && dropTarget.parentElement === columnContent) {
      // Insert before the target
      columnContent.insertBefore(draggedElement, dropTarget);
    } else if (!dropTarget || dropTarget === draggedElement) {
      // Dropped at end or on empty space - append to end
      columnContent.appendChild(draggedElement);
    }

    // Remove any empty state message since we now have a task
    const emptyState = columnContent.querySelector(".empty-state");
    if (emptyState) {
      emptyState.remove();
    }

    // Now calculate order based on actual DOM position
    // Get all task cards in the column after DOM update
    const allTasksInColumn = Array.from(columnContent.querySelectorAll(".task-card"));
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
      const previousOrder = parseInt(previousTask.dataset.order || "0", 10);
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
      // Check for special status transitions
      const isMovingToDoing = currentStatus === "To Do" && newStatus === "Doing";
      const isMovingOutOfDoing = currentStatus === "Doing" && newStatus !== "Doing";

      if (isMovingOutOfDoing) {
        // Show confirmation modal before moving out of Doing
        showStopExecutionModal(
          taskId,
          () => {
            // User confirmed - proceed with status update and stop execution
            draggedElement.dataset.status = newStatus;
            vscode.postMessage({
              command: "updateTaskOrder",
              taskId: taskId,
              order: newOrder,
              newStatus: newStatus,
              stopExecution: true,
            });
          },
          () => {
            // User cancelled - revert the drag
            const originalColumn = document.querySelector(`[data-status="${currentStatus}"]`);
            const originalColumnContent = originalColumn?.querySelector(".column-content");
            if (originalColumnContent) {
              originalColumnContent.appendChild(draggedElement);
            }
          }
        );
      } else {
        // Update the data-status attribute on the card
        draggedElement.dataset.status = newStatus;

        // Check if moving to Doing - start execution (only if not already running)
        // Prevent duplicate execution if task is already running
        const shouldStartExecution = isMovingToDoing && !runningTasks.has(taskId);

        vscode.postMessage({
          command: "updateTaskOrder",
          taskId: taskId,
          order: newOrder,
          newStatus: newStatus,
          startExecution: shouldStartExecution,
        });
      }
    } else {
      // Same column, just reordering
      vscode.postMessage({
        command: "updateTaskOrder",
        taskId: taskId,
        order: newOrder,
      });
    }

    // Re-store original order after task moves
    setTimeout(() => storeOriginalOrder(), 100);

    // Remove drag-over class
    column.classList.remove("drag-over");
  }
});

// Show PRD preview
function showPRDPreview(prdPath) {
  const board = document.getElementById("kanbanBoard");
  const panel = document.getElementById("prdPanel");
  const content = document.getElementById("prdContent");
  const terminalPanel = document.getElementById("terminalPanel");

  if (!board || !panel) return;

  // Add with-prd-sidebar class to board
  board.classList.add("with-prd-sidebar");

  // Show PRD sidebar with animation (slides in from right)
  panel.style.display = "flex";
  panel.style.visibility = "visible";
  // Use requestAnimationFrame to ensure display is applied before setting data attribute
  requestAnimationFrame(() => {
    panel.setAttribute("data-visible", "true");
  });

  // Update terminal panel positioning if it's visible
  if (terminalPanel && terminalPanel.getAttribute("data-visible") === "true") {
    terminalPanel.classList.add("with-sidebar");
  }

  // Get the selected card to find the task file path and track for Claude execution
  const selectedCard = document.querySelector(".task-card.selected");
  const taskFilePath = selectedCard ? selectedCard.dataset.filepath : undefined;
  currentPrdTaskId = selectedCard ? selectedCard.dataset.taskId : null;

  // Show/hide the Execute button based on whether we have a task
  const playBtn = document.getElementById("playPrdBtn");
  if (playBtn) {
    playBtn.style.display = currentPrdTaskId ? "inline-block" : "none";
  }

  // Show edit task button when a task is selected
  const editPrdBtn = document.getElementById("editPrdBtn");
  if (editPrdBtn) {
    editPrdBtn.style.display = currentPrdTaskId ? "inline-block" : "none";
  }

  // Cancel any active edit mode when switching tasks
  if (isPrdEditMode) {
    cancelPrdEdit();
  }

  // Load PRD content with task file path for accurate resolution
  console.log("Sending loadPRD message:", { prdPath, taskFilePath });
  vscode.postMessage({
    command: "loadPRD",
    prdPath: prdPath,
    taskFilePath: taskFilePath,
  });

  // Show loading state
  if (content) {
    content.innerHTML = '<div class="prd-placeholder">Loading PRD...</div>';
  }
}

// Close PRD preview
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function closePRD() {
  const board = document.getElementById("kanbanBoard");
  const panel = document.getElementById("prdPanel");
  const content = document.getElementById("prdContent");
  const terminalPanel = document.getElementById("terminalPanel");

  if (!board || !panel) return;

  // Remove with-prd-sidebar class from board
  board.classList.remove("with-prd-sidebar");

  // Hide PRD sidebar with animation (slides out to right)
  panel.setAttribute("data-visible", "false");
  // Wait for animation to complete before hiding
  setTimeout(() => {
    panel.style.display = "none";
    panel.style.visibility = "hidden";
  }, 300);

  // Update terminal panel positioning
  if (terminalPanel) {
    terminalPanel.classList.remove("with-sidebar");
  }

  // Clear selection
  document.querySelectorAll(".task-card").forEach((c) => {
    c.classList.remove("selected");
  });

  // Reset content
  if (content) {
    content.innerHTML = '<div class="prd-placeholder">Select a task to view its PRD</div>';
  }

  // Hide create button
  const createBtn = document.getElementById("createPrdBtn");
  if (createBtn) createBtn.style.display = "none";
}

// Create PRD for current task
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function createPRD() {
  if (!currentPrdTaskId) return;
  const panel = document.getElementById("prdPanel");
  const prdPath = panel ? panel.dataset.prdPath : "";

  vscode.postMessage({
    command: "createPRD",
    taskId: currentPrdTaskId,
    prdPath: prdPath,
  });
}

// Edit current PRD
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function editPRD() {
  const panel = document.getElementById("prdPanel");
  const prdPath = panel ? panel.dataset.prdPath : "";

  if (!prdPath) return;

  vscode.postMessage({
    command: "editPRD",
    prdPath: prdPath,
  });
}

// Terminal Panel Functions
function showTerminalPanel() {
  const terminalPanel = document.getElementById("terminalPanel");
  const board = document.getElementById("kanbanBoard");
  const prdPanel = document.getElementById("prdPanel");

  if (!terminalPanel || !board) return;

  // Add with-terminal class to board to adjust height
  board.classList.add("with-terminal");

  // Show terminal panel with animation (slides up from bottom)
  terminalPanel.style.display = "flex";
  terminalPanel.style.visibility = "visible";

  // Add with-sidebar class if PRD sidebar is visible
  if (prdPanel && prdPanel.getAttribute("data-visible") === "true") {
    terminalPanel.classList.add("with-sidebar");
  }

  requestAnimationFrame(() => {
    terminalPanel.setAttribute("data-visible", "true");
    terminalPanel.classList.remove("collapsed");
  });
}

// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function closeTerminal() {
  const terminalPanel = document.getElementById("terminalPanel");
  const board = document.getElementById("kanbanBoard");

  if (!terminalPanel || !board) return;

  // Remove with-terminal class from board
  board.classList.remove("with-terminal", "collapsed-terminal");

  // Hide terminal panel with animation (slides down)
  terminalPanel.setAttribute("data-visible", "false");
  terminalPanel.classList.remove("collapsed");

  setTimeout(() => {
    terminalPanel.style.display = "none";
    terminalPanel.style.visibility = "hidden";
  }, 300);
}

// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function toggleTerminal() {
  const terminalPanel = document.getElementById("terminalPanel");
  const board = document.getElementById("kanbanBoard");
  const toggleBtn = document.getElementById("terminalToggleBtn");

  if (!terminalPanel || !board) return;

  const isVisible = terminalPanel.getAttribute("data-visible") === "true";
  const isCollapsed = terminalPanel.classList.contains("collapsed");

  if (!isVisible) {
    showTerminalPanel();
  } else if (isCollapsed) {
    // Expand
    terminalPanel.classList.remove("collapsed");
    board.classList.remove("collapsed-terminal");
    board.classList.add("with-terminal");
    if (toggleBtn) toggleBtn.textContent = "−";
  } else {
    // Collapse
    terminalPanel.classList.add("collapsed");
    board.classList.remove("with-terminal");
    board.classList.add("collapsed-terminal");
    if (toggleBtn) toggleBtn.textContent = "+";
  }
}

// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function clearTerminal() {
  const terminalContent = document.getElementById("terminalContent");
  if (terminalContent) {
    terminalContent.innerHTML = '<div class="terminal-output-line info">Terminal cleared.</div>';
  }
}

function appendToTerminal(content, type = "info") {
  const terminalContent = document.getElementById("terminalContent");
  if (!terminalContent) return;

  // Show terminal if not visible
  const terminalPanel = document.getElementById("terminalPanel");
  if (terminalPanel && terminalPanel.getAttribute("data-visible") !== "true") {
    showTerminalPanel();
  }

  // Create output line
  const line = document.createElement("div");
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
  refreshBtns.forEach((btn) => {
    btn.classList.add("refreshing");
  });

  // Remove spinning after refresh completes (via message or timeout)
  setTimeout(() => {
    refreshBtns.forEach((btn) => {
      btn.classList.remove("refreshing");
    });
  }, 1000);

  vscode.postMessage({ command: "refresh" });
}

// Initialize project structure handler
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function initializeProject() {
  vscode.postMessage({ command: "initializeProject" });
}

// Create task handler
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function createTask() {
  vscode.postMessage({ command: "createTask" });
}

// ============ Batch Execution Functions ============
let isBatchRunning = false;
let batchProgress = { current: 0, total: 0, completed: 0, skipped: 0 };

// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
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

  const tasks = Array.from(toDoColumn.querySelectorAll(".task-card"));
  if (tasks.length === 0) {
    alert("No tasks in To Do column");
    return;
  }

  // Sort tasks by order (ascending), then by priority
  tasks.sort((a, b) => {
    const orderA = parseInt(a.dataset.order || "999999", 10);
    const orderB = parseInt(b.dataset.order || "999999", 10);

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
    const priorityA = a.classList.contains("high")
      ? "high"
      : a.classList.contains("medium")
        ? "medium"
        : "low";
    const priorityB = b.classList.contains("high")
      ? "high"
      : b.classList.contains("medium")
        ? "medium"
        : "low";
    return priorityOrder[priorityA] - priorityOrder[priorityB];
  });

  const taskIds = tasks.map((card) => card.dataset.taskId);

  vscode.postMessage({
    command: "startBatchExecution",
    taskIds: taskIds,
  });
}

function cancelBatchExecution() {
  vscode.postMessage({
    command: "cancelBatchExecution",
  });
}

function updateBatchUI(isRunning) {
  isBatchRunning = isRunning;

  const playAllBtn = document.querySelector(".play-all-btn");
  const progressBanner = document.getElementById("batchProgressBanner");

  if (playAllBtn) {
    playAllBtn.classList.toggle("running", isRunning);
    playAllBtn.innerHTML = isRunning
      ? "⏹ Stop All"
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play All';
    playAllBtn.title = isRunning ? "Cancel batch execution" : "Execute all tasks via Claude CLI";
  }

  if (progressBanner) {
    progressBanner.style.display = isRunning ? "flex" : "none";
  }
}

function updateBatchProgress(current, total, completed, skipped) {
  batchProgress = { current, total, completed, skipped };

  const currentEl = document.getElementById("batchProgressCurrent");
  const totalEl = document.getElementById("batchProgressTotal");
  const completedEl = document.getElementById("batchCompleted");
  const skippedEl = document.getElementById("batchSkipped");

  if (currentEl) currentEl.textContent = current;
  if (totalEl) totalEl.textContent = total;
  if (completedEl) completedEl.textContent = completed;
  if (skippedEl) skippedEl.textContent = skipped;
}
// ============ End Batch Execution Functions ============

// Open settings handler (PRD path config)
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function openSettings() {
  closeSettingsPanel();
  vscode.postMessage({ command: "openSettings" });
}

// Open VS Code extension settings
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function openExtensionSettings() {
  vscode.postMessage({ command: "openExtensionSettings" });
}

// Settings panel toggle
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function toggleSettingsPanel(event) {
  event.stopPropagation();
  const panel = document.getElementById("settingsPanel");
  if (panel) {
    panel.classList.toggle("open");
  }
}

function closeSettingsPanel() {
  const panel = document.getElementById("settingsPanel");
  if (panel) {
    panel.classList.remove("open");
  }
}

// Stop propagation on settings panel to prevent closing
document.getElementById("settingsPanel").addEventListener("click", (e) => {
  e.stopPropagation();
});

// Close settings panel when clicking outside
document.addEventListener("click", (e) => {
  const settingsBtn = e.target.closest(".settings-dropdown > button");
  if (settingsBtn) return; // Don't close when clicking the toggle button

  const settingsPanel = document.getElementById("settingsPanel");
  if (settingsPanel && !settingsPanel.contains(e.target)) {
    closeSettingsPanel();
  }
});

// Toggle column visibility instantly
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function toggleColumn(columnName, isVisible) {
  const column = document.querySelector(`.column[data-status="${columnName}"]`);
  if (column) {
    if (isVisible) {
      column.classList.remove("hidden");
    } else {
      column.classList.add("hidden");
    }
  }

  // Save to VS Code settings in background (don't wait)
  const enabledColumns = [];
  document.querySelectorAll('.column-toggle input[type="checkbox"]').forEach((checkbox) => {
    if (checkbox.checked) {
      enabledColumns.push(checkbox.dataset.column);
    }
  });

  // Update grid to match visible column count
  const board = document.getElementById("kanbanBoard");
  if (board) {
    board.style.gridTemplateColumns = `repeat(${enabledColumns.length}, minmax(200px, 1fr))`;
  }

  vscode.postMessage({
    command: "saveColumnSettings",
    columns: enabledColumns,
  });
}

// Sort change handler
// biome-ignore lint/correctness/noUnusedVariables: Called from HTML onclick
function onSortChange() {
  const sortSelect = document.getElementById("sortSelect");
  if (!(sortSelect instanceof HTMLSelectElement)) return;

  currentSortMode = sortSelect.value;

  switch (currentSortMode) {
    case "order-asc":
      sortTasksByOrder(true);
      break;
    case "order-desc":
      sortTasksByOrder(false);
      break;
    case "priority-asc":
      sortTasksByPriority(true);
      break;
    case "priority-desc":
      sortTasksByPriority(false);
      break;
    case "name-asc":
      sortTasksByName(true);
      break;
    case "name-desc":
      sortTasksByName(false);
      break;
    default:
      sortTasksByOrder(true);
      break;
  }
}

function sortTasksByOrder(ascending) {
  const columns = document.querySelectorAll(".column");

  columns.forEach((column) => {
    const content = column.querySelector(".column-content");
    if (!content) return;

    const tasks = Array.from(content.querySelectorAll(".task-card"));
    const emptyState = content.querySelector(".empty-state");

    if (tasks.length === 0) return;

    // Sort tasks by order attribute
    tasks.sort((a, b) => {
      const orderA = parseInt(a.dataset.order || "999999", 10);
      const orderB = parseInt(b.dataset.order || "999999", 10);
      const diff = orderA - orderB;
      return ascending ? diff : -diff;
    });

    // Store empty state node if it exists
    const emptyStateNode = emptyState ? emptyState.cloneNode(true) : null;

    // Remove all child nodes
    while (content.firstChild) {
      content.removeChild(content.firstChild);
    }

    // Re-append sorted tasks
    tasks.forEach((task) => {
      content.appendChild(task);
    });

    // Re-append empty state if it existed
    if (emptyStateNode) {
      content.appendChild(emptyStateNode);
    }
  });
}

function sortTasksByPriority(ascending) {
  const columns = document.querySelectorAll(".column");
  const priorityOrder = { high: 0, medium: 1, low: 2 };

  columns.forEach((column) => {
    const content = column.querySelector(".column-content");
    if (!content) return;

    const tasks = Array.from(content.querySelectorAll(".task-card"));
    const emptyState = content.querySelector(".empty-state");

    if (tasks.length === 0) return;

    // Sort tasks by priority
    tasks.sort((a, b) => {
      // Get priority from class list (cards have classes: high, medium, or low)
      let aPriority = "low";
      let bPriority = "low";

      if (a.classList.contains("high")) {
        aPriority = "high";
      } else if (a.classList.contains("medium")) {
        aPriority = "medium";
      }

      if (b.classList.contains("high")) {
        bPriority = "high";
      } else if (b.classList.contains("medium")) {
        bPriority = "medium";
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
    tasks.forEach((task) => {
      content.appendChild(task);
    });

    // Re-append empty state if it existed
    if (emptyStateNode) {
      content.appendChild(emptyStateNode);
    }
  });
}

function sortTasksByName(ascending) {
  const columns = document.querySelectorAll(".column");

  columns.forEach((column) => {
    const content = column.querySelector(".column-content");
    if (!content) return;

    const tasks = Array.from(content.querySelectorAll(".task-card"));
    const emptyState = content.querySelector(".empty-state");

    if (tasks.length === 0) return;

    // Sort tasks by name (from data-label or task title)
    tasks.sort((a, b) => {
      const aLabel = a.dataset.label || a.querySelector(".task-title")?.textContent || "";
      const bLabel = b.dataset.label || b.querySelector(".task-title")?.textContent || "";
      const comparison = aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
      return ascending ? comparison : -comparison;
    });

    // Store empty state node if it exists
    const emptyStateNode = emptyState ? emptyState.cloneNode(true) : null;

    // Remove all child nodes
    while (content.firstChild) {
      content.removeChild(content.firstChild);
    }

    // Re-append sorted tasks
    tasks.forEach((task) => {
      content.appendChild(task);
    });

    // Re-append empty state if it existed
    if (emptyStateNode) {
      content.appendChild(emptyStateNode);
    }
  });
}

function _sortTasksByDefault() {
  // Restore original order from stored map
  const columns = document.querySelectorAll(".column");

  columns.forEach((column) => {
    const content = column.querySelector(".column-content");
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
      const tasks = Array.from(content.querySelectorAll(".task-card"));
      if (tasks.length === 0) return;
      tasks.sort((a, b) => {
        const aId = a.dataset.taskId;
        const bId = b.dataset.taskId;
        const aIndex = updatedOrder.indexOf(aId);
        const bIndex = updatedOrder.indexOf(bId);
        return aIndex - bIndex;
      });
      const emptyState = content.querySelector(".empty-state");
      const emptyStateNode = emptyState ? emptyState.cloneNode(true) : null;
      while (content.firstChild) {
        content.removeChild(content.firstChild);
      }
      tasks.forEach((task) => {
        content.appendChild(task);
      });
      if (emptyStateNode) content.appendChild(emptyStateNode);
      return;
    }

    const tasks = Array.from(content.querySelectorAll(".task-card"));
    const emptyState = content.querySelector(".empty-state");

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
    tasks.forEach((task) => {
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
  const columns = document.querySelectorAll(".column");
  originalTaskOrder.clear(); // Clear old order
  columns.forEach((column) => {
    const content = column.querySelector(".column-content");
    if (!content) return;
    const columnStatus = column.dataset.status;
    const tasks = Array.from(content.querySelectorAll(".task-card"));
    const taskIds = tasks.map((task) => task.dataset.taskId);
    if (taskIds.length > 0) {
      originalTaskOrder.set(columnStatus, taskIds);
    }
  });
}

// Store original order when page loads (use DOMContentLoaded or setTimeout)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => storeOriginalOrder(), 50);
  });
} else {
  setTimeout(() => storeOriginalOrder(), 50);
}

// Handle messages from extension
window.addEventListener("message", (event) => {
  const message = event.data;
  switch (message.command) {
    case "updatePRDContent": {
      console.log("Received updatePRDContent:", {
        prdExists: message.prdExists,
        prdPath: message.prdPath,
        hasContent: !!message.content,
      });

      const panel = document.getElementById("prdPanel");
      const board = document.getElementById("kanbanBoard");
      const content = document.getElementById("prdContent");
      const terminalPanel = document.getElementById("terminalPanel");
      const createBtn = document.getElementById("createPrdBtn");

      if (panel && content) {
        // Ensure sidebar is visible when content is updated
        panel.style.display = "flex";
        panel.style.visibility = "visible";
        if (board) {
          board.classList.add("with-prd-sidebar");
        }
        requestAnimationFrame(() => {
          panel.setAttribute("data-visible", "true");
        });
        content.innerHTML = `<div class="prd-markdown">${message.content}</div>`;

        // Show/hide create PRD button based on PRD existence
        if (createBtn) {
          createBtn.style.display = message.prdExists ? "none" : "inline-flex";
        }

        // Store current PRD path for edit function
        panel.dataset.prdPath = message.prdPath || "";

        // Update terminal panel positioning if visible
        if (terminalPanel && terminalPanel.getAttribute("data-visible") === "true") {
          terminalPanel.classList.add("with-sidebar");
        }
      }
      break;
    }

    case "ralphCommandExecuted": {
      showTerminalPanel();
      appendToTerminal("✅ Ralph command executed successfully", "success");
      appendToTerminal(message.command || "Command executed", "info");
      break;
    }

    case "ralphCommandError": {
      const errorMsg = message.error || "Failed to execute ralph command";
      showTerminalPanel();
      appendToTerminal(`❌ Ralph command error: ${errorMsg}`, "error");
      alert(`Error: ${errorMsg}`);
      break;
    }

    case "claudeExecutionStarted": {
      runningTasks.add(message.taskId);
      updateTaskRunningState(message.taskId, true);
      showTerminalPanel();
      appendToTerminal(`✅ Execution started for task: ${message.taskId}`, "success");
      break;
    }

    case "claudeExecutionStopped": {
      runningTasks.delete(message.taskId);
      updateTaskRunningState(message.taskId, false);
      appendToTerminal(`⏹ Execution stopped for task: ${message.taskId}`, "info");
      break;
    }

    case "claudeExecutionError": {
      runningTasks.delete(message.taskId);
      updateTaskRunningState(message.taskId, false);
      const errorMsg = message.error || "Unknown error";
      appendToTerminal(`❌ Execution failed: ${errorMsg}`, "error");
      alert(`Claude execution failed: ${errorMsg}`);
      break;
    }

    case "claudeProgressUpdate": {
      updateTaskProgress(message.taskId, message.toolName, message.status);
      break;
    }

    case "claudeProgressStopped": {
      clearTaskProgress(message.taskId);
      break;
    }

    case "terminalOutput": {
      const outputType = message.type || "info";
      appendToTerminal(message.content, outputType);
      break;
    }

    // Rate limit message handlers
    case "rateLimitCountdownStart": {
      startRateLimitCountdown(message.taskId, message.waitSeconds);
      break;
    }

    case "rateLimitRetrying": {
      clearRateLimitUI();
      runningTasks.add(message.taskId);
      updateTaskRunningState(message.taskId, true);
      break;
    }

    // ============ Review Message Handlers ============
    case "reviewStarted": {
      const taskId = message.data?.taskId || message.taskId;
      reviewingTasks.add(taskId);
      updateReviewBadge(taskId, "in_progress");
      updateCombinedRunningState(taskId);
      appendToTerminal(`🔍 Starting AI review for task: ${taskId}`, "info");
      break;
    }

    case "reviewComplete": {
      const taskId = message.data?.taskId || message.taskId;
      const result = message.data?.result || message.result;
      reviewingTasks.delete(taskId);
      updateReviewBadge(taskId, "completed", result?.overallRating);
      updateCombinedRunningState(taskId);
      const emoji =
        result?.overallRating === "pass"
          ? "✅"
          : result?.overallRating === "needs_work"
            ? "⚠️"
            : "❌";
      appendToTerminal(
        `${emoji} Review complete: ${result?.overallRating || "unknown"} (${result?.findings?.length || 0} findings)`,
        result?.overallRating === "pass" ? "success" : "info"
      );
      break;
    }

    case "reviewFailed": {
      const taskId = message.data?.taskId || message.taskId;
      const error = message.data?.error || message.error;
      reviewingTasks.delete(taskId);
      updateReviewBadge(taskId, "failed");
      updateCombinedRunningState(taskId);
      appendToTerminal(`❌ Review failed: ${error || "Unknown error"}`, "error");
      break;
    }

    case "reviewStatusUpdate": {
      const taskId = message.data?.taskId || message.taskId;
      const state = message.data?.state;
      if (state) {
        if (state.status === "in_progress") {
          reviewingTasks.add(taskId);
        } else {
          reviewingTasks.delete(taskId);
        }
        updateReviewBadge(taskId, state.status, state.result?.overallRating);
        updateCombinedRunningState(taskId);
      }
      break;
    }

    case "taskStatusChanged": {
      const { taskLabel, newStatus, emoji } = message;
      const statusUpper = newStatus.toUpperCase().replace(/ /g, "_");
      showTerminalPanel();
      appendToTerminal(`${emoji} Task status: ${statusUpper} → "${taskLabel}"`, "info");
      break;
    }

    case "planningStarted": {
      const taskId = message.taskId;
      const card = document.querySelector(`[data-task-id="${taskId}"]`);
      const taskLabel = card ? card.dataset.label : taskId;
      showTerminalPanel();
      appendToTerminal(`📝 Starting PRD planning for "${taskLabel}"...`, "info");
      break;
    }

    case "planningFailed": {
      const taskId = message.taskId;
      const error = message.error || "Unknown error";
      const card = document.querySelector(`[data-task-id="${taskId}"]`);
      const taskLabel = card ? card.dataset.label : taskId;
      appendToTerminal(`❌ PRD planning failed for "${taskLabel}": ${error}`, "error");
      break;
    }
    // ============ End Review Message Handlers ============

    // ============ Batch Execution Message Handlers ============
    case "batchExecutionStarted": {
      updateBatchUI(true);
      updateBatchProgress(0, message.total, 0, 0);
      showTerminalPanel();
      appendToTerminal(`🚀 Starting batch execution: ${message.total} tasks`, "info");
      appendToTerminal("---", "info");
      break;
    }

    case "batchTaskStarted": {
      // Highlight the current task being executed
      const card = document.querySelector(`[data-task-id="${message.taskId}"]`);
      if (card) {
        card.classList.add("running");
        const taskName = card.dataset.label || message.taskId;
        appendToTerminal(
          `▶ Starting task [${message.index + 1}/${message.total}]: ${taskName}`,
          "info"
        );
      }
      updateBatchProgress(
        message.index + 1,
        message.total,
        batchProgress.completed,
        batchProgress.skipped
      );
      break;
    }

    case "batchTaskCompleted": {
      // Remove running state from task
      const taskCard = document.querySelector(`[data-task-id="${message.taskId}"]`);
      if (taskCard) {
        taskCard.classList.remove("running");
        const taskName = taskCard.dataset.label || message.taskId;
        if (message.success) {
          taskCard.classList.add("agent-completed");
          appendToTerminal(`✅ Completed: ${taskName}`, "success");
          batchProgress.completed++;
        } else {
          appendToTerminal(`⏭ Skipped: ${taskName}`, "info");
          batchProgress.skipped++;
        }
      }

      updateBatchProgress(
        batchProgress.current,
        batchProgress.total,
        batchProgress.completed,
        batchProgress.skipped
      );
      break;
    }

    case "batchExecutionProgress": {
      updateBatchProgress(message.current, message.total, message.completed, message.skipped);
      appendToTerminal(
        `📊 Progress: ${message.current}/${message.total} (Completed: ${message.completed}, Skipped: ${message.skipped})`,
        "info"
      );
      break;
    }

    case "batchExecutionComplete": {
      updateBatchUI(false);
      appendToTerminal("---", "info");
      appendToTerminal(`🎉 Batch execution complete!`, "success");
      appendToTerminal(`   Completed: ${message.completed}`, "success");
      appendToTerminal(`   Skipped: ${message.skipped}`, "info");
      alert(`Batch complete!\n\nCompleted: ${message.completed}\nSkipped: ${message.skipped}`);
      refresh(); // Refresh to update task positions
      break;
    }

    case "batchExecutionCancelled": {
      updateBatchUI(false);
      appendToTerminal("---", "info");
      appendToTerminal(`⚠️ Batch execution cancelled`, "error");
      appendToTerminal(`   Completed: ${message.completed}`, "info");
      appendToTerminal(`   Remaining: ${message.total - message.current}`, "info");
      alert(
        `Batch cancelled.\n\nCompleted: ${message.completed}\nRemaining: ${message.total - message.current}`
      );
      refresh();
      break;
    }
    // ============ End Batch Execution Message Handlers ============

    // ============ Claude Quota Message Handlers ============
    case "claudeQuotaLoading": {
      const loading = document.getElementById("quotaLoading");
      const content = document.getElementById("quotaContent");
      const error = document.getElementById("quotaError");
      if (loading) loading.style.display = "flex";
      if (content) content.style.display = "none";
      if (error) error.style.display = "none";
      break;
    }

    case "claudeQuotaUpdate": {
      updateQuotaUI(message.data);
      break;
    }

    case "claudeQuotaError": {
      const loading = document.getElementById("quotaLoading");
      const content = document.getElementById("quotaContent");
      const error = document.getElementById("quotaError");
      const refreshBtn = document.querySelector(".quota-refresh-btn");
      if (refreshBtn) refreshBtn.classList.remove("refreshing");
      if (loading) loading.style.display = "none";
      if (content) content.style.display = "none";
      if (error) {
        error.style.display = "flex";
        document.getElementById("quotaErrorText").textContent =
          message.error || "Failed to fetch quota";
      }
      break;
    }
    // ============ End Claude Quota Message Handlers ============

    // ============ Codex Quota Message Handlers ============
    case "codexQuotaLoading": {
      const loading = document.getElementById("codexQuotaLoading");
      const content = document.getElementById("codexQuotaContent");
      const error = document.getElementById("codexQuotaError");
      if (loading) loading.style.display = "flex";
      if (content) content.style.display = "none";
      if (error) error.style.display = "none";
      break;
    }

    case "codexQuotaUpdate": {
      updateCodexQuotaUI(message.data);
      break;
    }

    case "codexQuotaError": {
      const loading = document.getElementById("codexQuotaLoading");
      const content = document.getElementById("codexQuotaContent");
      const error = document.getElementById("codexQuotaError");
      const refreshBtn = document.querySelector("#codexQuotaWidget .quota-refresh-btn");
      if (refreshBtn) refreshBtn.classList.remove("refreshing");
      if (loading) loading.style.display = "none";
      if (content) content.style.display = "none";
      if (error) {
        error.style.display = "flex";
        document.getElementById("codexQuotaErrorText").textContent =
          message.error || "Failed to fetch Codex quota";
      }
      break;
    }
    // ============ End Codex Quota Message Handlers ============

    // ============ PRD Edit Message Handlers ============
    case "prdRawContent": {
      if (message.content !== undefined) {
        enterPrdEditMode(message.content);
      } else if (message.error) {
        alert(`Failed to load PRD content: ${message.error}`);
      }
      break;
    }

    case "prdSaveResult": {
      if (message.success) {
        // Exit edit mode and refresh the preview
        cancelPrdEdit();
        // Reload the PRD to show updated content
        if (currentPrdPath) {
          const selectedCard = document.querySelector(".task-card.selected");
          const taskFilePath = selectedCard ? selectedCard.dataset.filepath : undefined;
          vscode.postMessage({
            command: "loadPRD",
            prdPath: currentPrdPath,
            taskFilePath: taskFilePath,
          });
        }
      } else {
        alert(`Failed to save PRD: ${message.error || "Unknown error"}`);
      }
      break;
    }
    // ============ End PRD Edit Message Handlers ============
  }
});

// Request initial data now that message listener is ready
vscode.postMessage({ command: "getClaudeQuota" });
vscode.postMessage({ command: "getCodexQuota" });
vscode.postMessage({ command: "getCLIStatus" });
