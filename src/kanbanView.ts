import * as path from "node:path";
import * as vscode from "vscode";
import { ClaudeCodeQuotaService } from "./services/claudeCodeQuotaService";
import { CLIDetectionService } from "./services/cliDetectionService";
import { SkillService } from "./services/skillService";
import { TranscriptMonitorService } from "./services/transcriptMonitorService";
import { type Task, TaskParser } from "./taskParser";
import type { QuotaDisplayData } from "./types/claudeQuota";
import { formatResetTime, getQuotaStatus } from "./types/claudeQuota";
import type { ClaudeStepProgress } from "./types/claudeTranscript";
import type { CLIAvailabilityStatus, CLIProviderName, CLISelectionMode } from "./types/cli";
import { getCLIDisplayName } from "./types/cli";
import { Icons } from "./utils/lucideIcons";

export class KanbanViewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private taskParser: TaskParser;
  private skillService: SkillService;
  private quotaService: ClaudeCodeQuotaService;
  private cliDetectionService: CLIDetectionService;
  private transcriptMonitorService: TranscriptMonitorService;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private skipNextConfigRefresh = false;
  private quotaRefreshInterval: NodeJS.Timeout | undefined;
  private cachedCLIStatus: CLIAvailabilityStatus | null = null;

  // Batch execution state
  private batchExecutionQueue: string[] = [];
  private currentBatchIndex = 0;
  private isBatchExecuting = false;
  private batchExecutionCancelled = false;
  private batchCompletedCount = 0;
  private batchSkippedCount = 0;

  constructor(private context: vscode.ExtensionContext) {
    this.taskParser = new TaskParser();
    this.skillService = new SkillService();
    this.quotaService = new ClaudeCodeQuotaService();
    this.cliDetectionService = new CLIDetectionService();
    this.transcriptMonitorService = new TranscriptMonitorService();

    // Listen for configuration changes to auto-refresh board
    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration("kaiban.columns.enabled")) {
          // Skip refresh if the change came from the webview (UI already updated)
          if (this.skipNextConfigRefresh) {
            this.skipNextConfigRefresh = false;
            return;
          }
          // Auto-refresh the board when columns change from external source
          this.refresh();
        }
      },
      null,
      this.context.subscriptions
    );
  }

  /**
   * Dispose all resources held by this provider.
   * Called when the extension is deactivated.
   */
  public dispose(): void {
    // Clear quota refresh interval
    if (this.quotaRefreshInterval) {
      clearInterval(this.quotaRefreshInterval);
      this.quotaRefreshInterval = undefined;
    }

    // Clear all polling intervals
    for (const [, interval] of this.pollingIntervals) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    // Dispose all terminals
    for (const [, terminal] of this.claudeTerminals) {
      terminal.dispose();
    }
    this.claudeTerminals.clear();

    // Dispose all file watchers
    for (const [, watcher] of this.completionWatchers) {
      watcher.dispose();
    }
    this.completionWatchers.clear();

    // Clear completion pollers
    for (const [, timeout] of this.completionPollers) {
      clearTimeout(timeout);
    }
    this.completionPollers.clear();

    // Dispose transcript monitors
    this.transcriptMonitorService.dispose();

    // Dispose panel if exists
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
  }

  public async show() {
    if (this.panel) {
      this.panel.reveal();
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "kaibanBoard",
      "Kaiban Board",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
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
          case "openSettings":
            await vscode.commands.executeCommand("kaiban.configurePRDPath");
            break;
          case "openExtensionSettings":
            await vscode.commands.executeCommand("workbench.action.openSettings", "kaiban");
            break;
          case "loadPRD":
            await this.loadPRDContent(message.prdPath, message.taskFilePath);
            break;
          case "updateTaskStatus":
            await this.updateTaskStatus(message.taskId, message.newStatus);
            break;
          case "updateTaskOrder":
            await this.handleUpdateTaskOrder(
              message.taskId,
              message.order,
              message.newStatus,
              message.startExecution,
              message.stopExecution
            );
            break;
          case "saveColumnSettings":
            await this.saveColumnSettings(message.columns);
            break;
          case "executeRalphCommand":
            await this.handleExecuteRalphCommand(message.taskId);
            break;
          case "executeViaClaude":
            await this.handleExecuteViaClaude(message.taskId);
            break;
          case "stopClaudeExecution":
            await this.handleStopClaudeExecution(message.taskId);
            break;
          case "createTask":
            await vscode.commands.executeCommand("kaiban.createTask");
            break;
          case "createPRD":
            await this.handleCreatePRD(message.taskId, message.prdPath);
            break;
          case "editPRD":
            await this.handleEditPRD(message.prdPath);
            break;
          case "getPrdRawContent":
            await this.handleGetPrdRawContent(message.prdPath);
            break;
          case "savePrdContent":
            await this.handleSavePrdContent(message.prdPath, message.content);
            break;
          case "updateTask":
            await this.handleUpdateTask(message.taskId, message.updates);
            break;
          case "startBatchExecution":
            await this.handleStartBatchExecution(message.taskIds);
            break;
          case "cancelBatchExecution":
            await this.handleCancelBatchExecution();
            break;
          case "getClaudeQuota":
            await this.handleGetClaudeQuota();
            break;
          case "refreshClaudeQuota":
            await this.handleRefreshClaudeQuota();
            break;
          case "getCLIStatus":
            await this.handleGetCLIStatus();
            break;
          case "refreshCLIStatus":
            await this.handleRefreshCLIStatus();
            break;
          case "executeViaCLI":
            await this.handleExecuteViaCLI(message.taskId, message.cliProvider);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    await this.refresh();

    // Start quota auto-refresh (every 5 minutes)
    this.startQuotaAutoRefresh();

    // Note: Initial quota and CLI status are requested by webview when ready (avoids race condition)
  }

  /**
   * Start auto-refresh for Claude quota (every 5 minutes)
   */
  private startQuotaAutoRefresh(): void {
    // Clear existing interval if any
    if (this.quotaRefreshInterval) {
      clearInterval(this.quotaRefreshInterval);
    }

    // Refresh every 5 minutes (300000ms)
    this.quotaRefreshInterval = setInterval(async () => {
      await this.handleGetClaudeQuota();
    }, 300000);
  }

  /**
   * Handle get Claude quota request
   */
  private async handleGetClaudeQuota(): Promise<void> {
    if (!this.panel) return;

    // Send loading state
    this.panel.webview.postMessage({
      command: "claudeQuotaLoading",
    });

    try {
      const quotaData = await this.quotaService.getQuota();

      this.panel.webview.postMessage({
        command: "claudeQuotaUpdate",
        data: this.serializeQuotaData(quotaData),
      });
    } catch (error) {
      this.panel.webview.postMessage({
        command: "claudeQuotaError",
        error: String(error),
      });
    }
  }

  /**
   * Handle manual refresh of Claude quota
   */
  private async handleRefreshClaudeQuota(): Promise<void> {
    this.quotaService.clearCache();
    await this.handleGetClaudeQuota();
  }

  /**
   * Serialize quota data for webview (convert Dates to strings)
   */
  private serializeQuotaData(data: QuotaDisplayData): {
    usage: {
      fiveHour: {
        utilization: number;
        resetsAt: string;
        resetTimeFormatted: string;
        status: string;
      };
      sevenDay: {
        utilization: number;
        resetsAt: string;
        resetTimeFormatted: string;
        status: string;
      };
      sevenDaySonnet?: {
        utilization: number;
        resetsAt: string;
        resetTimeFormatted: string;
        status: string;
      };
      lastUpdated: string;
    } | null;
    error: string | null;
    isLoading: boolean;
    isMacOS: boolean;
  } {
    if (!data.usage) {
      return {
        usage: null,
        error: data.error,
        isLoading: data.isLoading,
        isMacOS: data.isMacOS,
      };
    }

    const usage: {
      fiveHour: {
        utilization: number;
        resetsAt: string;
        resetTimeFormatted: string;
        status: string;
      };
      sevenDay: {
        utilization: number;
        resetsAt: string;
        resetTimeFormatted: string;
        status: string;
      };
      sevenDaySonnet?: {
        utilization: number;
        resetsAt: string;
        resetTimeFormatted: string;
        status: string;
      };
      lastUpdated: string;
    } = {
      fiveHour: {
        utilization: data.usage.fiveHour.utilization,
        resetsAt: data.usage.fiveHour.resetsAt.toISOString(),
        resetTimeFormatted: formatResetTime(data.usage.fiveHour.resetsAt),
        status: getQuotaStatus(data.usage.fiveHour.utilization),
      },
      sevenDay: {
        utilization: data.usage.sevenDay.utilization,
        resetsAt: data.usage.sevenDay.resetsAt.toISOString(),
        resetTimeFormatted: formatResetTime(data.usage.sevenDay.resetsAt),
        status: getQuotaStatus(data.usage.sevenDay.utilization),
      },
      lastUpdated: data.usage.lastUpdated.toISOString(),
    };

    if (data.usage.sevenDaySonnet) {
      usage.sevenDaySonnet = {
        utilization: data.usage.sevenDaySonnet.utilization,
        resetsAt: data.usage.sevenDaySonnet.resetsAt.toISOString(),
        resetTimeFormatted: formatResetTime(data.usage.sevenDaySonnet.resetsAt),
        status: getQuotaStatus(data.usage.sevenDaySonnet.utilization),
      };
    }

    const result: ReturnType<typeof this.serializeQuotaData> = {
      usage,
      error: data.error,
      isLoading: data.isLoading,
      isMacOS: data.isMacOS,
    };

    return result;
  }

  /**
   * Handle get CLI status request
   */
  private async handleGetCLIStatus(): Promise<void> {
    if (!this.panel) return;

    try {
      const config = vscode.workspace.getConfiguration("kaiban");
      const selectionMode = config.get<CLISelectionMode>("cli.defaultProvider", "auto");

      const status = await this.cliDetectionService.getCLIAvailabilityStatus(selectionMode);
      this.cachedCLIStatus = status;

      this.panel.webview.postMessage({
        command: "cliStatusUpdate",
        data: status,
      });
    } catch (error) {
      this.panel.webview.postMessage({
        command: "cliStatusError",
        error: String(error),
      });
    }
  }

  /**
   * Handle manual refresh of CLI status
   */
  private async handleRefreshCLIStatus(): Promise<void> {
    this.cliDetectionService.clearCache();
    await this.handleGetCLIStatus();
  }

  /**
   * Execute task via specified CLI or auto-selected CLI
   */
  private async handleExecuteViaCLI(taskId: string, cliProvider?: CLIProviderName): Promise<void> {
    try {
      // Check if task is already running
      if (this.claudeTerminals.has(taskId)) {
        vscode.window.showWarningMessage(
          "Task is already running. Stop it first before starting again."
        );
        return;
      }

      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Get CLI status and selected provider
      const config = vscode.workspace.getConfiguration("kaiban");
      const selectionMode = config.get<CLISelectionMode>("cli.defaultProvider", "auto");
      const status =
        this.cachedCLIStatus ||
        (await this.cliDetectionService.getCLIAvailabilityStatus(selectionMode));

      // Determine which CLI to use
      let selectedCLI: CLIProviderName | null = cliProvider || null;

      if (!selectedCLI) {
        if (!status.hasAvailableCLI || !status.selectedProvider) {
          throw new Error("No CLI available. Install Claude CLI, Codex CLI, or Cursor CLI.");
        }
        selectedCLI = status.selectedProvider;
      }

      // Verify the selected CLI is available
      const cliResult = status.clis.find((c) => c.name === selectedCLI);
      if (!cliResult?.available) {
        throw new Error(`${getCLIDisplayName(selectedCLI)} is not available`);
      }

      // Get CLI-specific configuration
      const cliConfig = this.cliDetectionService.getCLIConfig(selectedCLI, {
        get: <T>(key: string, defaultValue: T) => config.get<T>(key, defaultValue),
      });

      // Build the command
      const taskInstruction = cliConfig.promptTemplate.replace("{taskFile}", task.filePath);
      const flags = cliConfig.additionalFlags ? `${cliConfig.additionalFlags} ` : "";

      // For Claude, check if we should use ralph-loop
      let fullCommand: string;
      if (selectedCLI === "claude") {
        const useRalphLoop = config.get<boolean>("claude.useRalphLoop", false);
        const ralphCommand = config.get<string>("ralph.command", "/ralph-loop:ralph-loop");
        const maxIterations = config.get<number>("ralph.maxIterations", 5);
        const completionPromise = config.get<string>("ralph.completionPromise", "TASK COMPLETE");

        if (useRalphLoop) {
          const ralphCmd = `${ralphCommand} "${taskInstruction}" --completion-promise "${completionPromise}" --max-iterations ${maxIterations}`;
          fullCommand = `${cliConfig.executablePath} ${flags}"${ralphCmd}"`;
        } else {
          fullCommand = `${cliConfig.executablePath} ${flags}"${taskInstruction}"`;
        }
      } else {
        // For Codex and Cursor, use simple command format
        fullCommand = `${cliConfig.executablePath} ${flags}"${taskInstruction}"`;
      }

      // Get workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const cwd = workspaceFolders?.[0]?.uri.fsPath;

      // Create terminal
      const terminalName = `${getCLIDisplayName(selectedCLI)}: ${task.label.substring(0, 20)}`;
      const terminal = vscode.window.createTerminal({
        name: terminalName,
        cwd: cwd,
      });

      // Store terminal reference
      this.claudeTerminals.set(taskId, terminal);

      terminal.show();
      terminal.sendText(fullCommand);

      // Update task status to Doing
      await this.taskParser.updateTaskStatus(taskId, "Doing");

      // Notify user
      vscode.window.showInformationMessage(
        `Executing via ${getCLIDisplayName(selectedCLI)}: ${task.label}`
      );

      // Notify webview
      if (this.panel) {
        this.panel.webview.postMessage({
          command: "claudeExecutionStarted",
          taskId,
          cliProvider: selectedCLI,
        });
      }

      // Set up completion tracking
      this.watchForCompletion(taskId);

      // Start transcript monitoring for Claude CLI (real-time progress)
      if (selectedCLI === "claude" && cwd) {
        this.startTranscriptMonitoring(taskId, cwd);
      }

      // Refresh board to show updated status
      await this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to execute task: ${error}`);
      if (this.panel) {
        this.panel.webview.postMessage({
          command: "claudeExecutionError",
          taskId,
          error: String(error),
        });
      }
    }
  }

  /**
   * Start monitoring Claude CLI transcript for real-time progress updates.
   */
  private startTranscriptMonitoring(taskId: string, workspacePath: string): void {
    this.transcriptMonitorService.startMonitoring(
      taskId,
      workspacePath,
      (progress: ClaudeStepProgress) => {
        this.sendProgressUpdate(taskId, progress);
      }
    );
  }

  /**
   * Send progress update to webview.
   */
  private sendProgressUpdate(taskId: string, progress: ClaudeStepProgress): void {
    if (!this.panel) return;

    const displayInfo = TranscriptMonitorService.getProgressDisplayText(progress);

    this.panel.webview.postMessage({
      command: "claudeProgressUpdate",
      taskId,
      toolName: displayInfo.toolName,
      status: displayInfo.status,
      currentStep: progress.currentStep,
      recentSteps: progress.recentSteps.slice(-5), // Send last 5 steps
    });
  }

  public async refresh() {
    if (!this.panel) {
      return;
    }

    const tasks = await this.taskParser.parseTasks();
    const groupedTasks = this.taskParser.groupByStatus(tasks);

    this.panel.webview.html = await this.getWebviewContent(groupedTasks);
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

  private async loadPRDContent(prdPath: string, taskFilePath?: string) {
    if (!this.panel) {
      console.error("loadPRDContent: Panel not available");
      return;
    }

    console.log("loadPRDContent called:", { prdPath, taskFilePath });

    try {
      // Get PRD base path from configuration
      const config = vscode.workspace.getConfiguration("kaiban.prd");
      const basePath = config.get<string>("basePath", ".agent/PRDS");
      console.log("PRD base path:", basePath);

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        console.error("loadPRDContent: No workspace folders");
        this.panel.webview.postMessage({
          command: "updatePRDContent",
          content: `<p class="prd-not-found">No workspace folder open.</p>`,
          prdExists: false,
          prdPath: prdPath,
        });
        return;
      }

      let prdContent = "";

      for (const folder of workspaceFolders) {
        // Strategy 1: Resolve from configured base path (primary method)
        // Extract the relative path after any "../" segments that navigate to PRDS/
        // For paths like "../../../PRDS/analytics/file.md", extract "analytics/file.md"
        let relativePrdPath = prdPath;

        // If path contains the base path directory name, extract everything after it
        const basePathDir = path.basename(basePath);
        if (prdPath.includes(`${basePathDir}/`)) {
          const index = prdPath.indexOf(`${basePathDir}/`);
          relativePrdPath = prdPath.substring(index + basePathDir.length + 1);
        } else if (prdPath.startsWith("../") || prdPath.startsWith("./")) {
          // For relative paths starting with ../, extract just the filename or subpath
          // This handles cases where the path is like "../PRDS/file.md"
          const parts = prdPath.split("/");
          // Find where the actual file path starts (after all ../)
          let startIndex = 0;
          for (let i = 0; i < parts.length; i++) {
            if (parts[i] !== ".." && parts[i] !== "." && parts[i] !== "") {
              startIndex = i;
              break;
            }
          }
          // If we found the base path directory, skip it
          if (parts[startIndex] === basePathDir) {
            relativePrdPath = parts.slice(startIndex + 1).join("/");
          } else {
            relativePrdPath = parts.slice(startIndex).join("/");
          }
        } else if (!path.isAbsolute(prdPath) && !prdPath.startsWith("http")) {
          // For simple relative paths, use as-is
          relativePrdPath = prdPath;
        }

        // Resolve from the configured base path
        try {
          const baseUri = vscode.Uri.joinPath(folder.uri, basePath);
          const prdUri = vscode.Uri.joinPath(baseUri, relativePrdPath);
          console.log("Trying to load PRD from:", prdUri.fsPath);
          const document = await vscode.workspace.openTextDocument(prdUri);
          prdContent = document.getText();
          if (prdContent) {
            console.log("PRD loaded successfully from base path");
            break;
          }
        } catch (error) {
          console.log("Failed to load from base path:", error);
        }

        // Strategy 2: Fallback - resolve relative to task file if available
        if (taskFilePath && !prdContent) {
          try {
            const taskDir = path.dirname(taskFilePath);
            const resolvedPath = path.resolve(taskDir, prdPath);
            const prdUri = vscode.Uri.file(resolvedPath);
            console.log("Trying to load PRD from task file relative path:", prdUri.fsPath);
            const document = await vscode.workspace.openTextDocument(prdUri);
            prdContent = document.getText();
            if (prdContent) {
              console.log("PRD loaded successfully from task file relative path");
              break;
            }
          } catch (error) {
            console.log("Failed to load from task file relative path:", error);
          }
        }

        // Strategy 3: Fallback - resolve relative to workspace root
        if (!prdContent && !prdPath.startsWith("/") && !prdPath.startsWith("http")) {
          try {
            const prdUri = vscode.Uri.joinPath(folder.uri, prdPath);
            console.log("Trying to load PRD from workspace root:", prdUri.fsPath);
            const document = await vscode.workspace.openTextDocument(prdUri);
            prdContent = document.getText();
            if (prdContent) {
              console.log("PRD loaded successfully from workspace root");
              break;
            }
          } catch (error) {
            console.log("Failed to load from workspace root:", error);
          }
        }
      }

      if (prdContent) {
        // Simple markdown rendering (basic)
        const renderedContent = this.renderMarkdown(prdContent);
        console.log("Sending PRD content to webview, length:", renderedContent.length);
        this.panel.webview.postMessage({
          command: "updatePRDContent",
          content: renderedContent,
          prdExists: true,
          prdPath: prdPath,
        });
      } else {
        console.log("No PRD content found, sending not found message");
        this.panel.webview.postMessage({
          command: "updatePRDContent",
          content: `<p class="prd-not-found">No PRD found for this task. Path attempted: ${prdPath}</p>`,
          prdExists: false,
          prdPath: prdPath,
        });
      }
    } catch (error) {
      console.error("Error in loadPRDContent:", error);
      this.panel.webview.postMessage({
        command: "updatePRDContent",
        content: `<p>Error loading PRD: ${error}</p>`,
        prdExists: false,
        prdPath: prdPath,
      });
    }
  }

  private async handleCreatePRD(taskId: string, _suggestedPath: string) {
    if (!this.panel) return;

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      // Get PRD base path from configuration
      const config = vscode.workspace.getConfiguration("kaiban.prd");
      const basePath = config.get<string>("basePath", ".agent/PRDS");

      // Get task info
      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);
      if (!task) {
        vscode.window.showErrorMessage("Task not found");
        return;
      }

      // Generate PRD filename from task label
      const slug = task.label
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const prdFileName = `${slug}.md`;

      // Create PRD directory if needed
      const prdDir = vscode.Uri.joinPath(workspaceFolders[0].uri, basePath);
      try {
        await vscode.workspace.fs.createDirectory(prdDir);
      } catch (_e) {
        // Directory may already exist
      }

      // Create PRD file with template
      const prdUri = vscode.Uri.joinPath(prdDir, prdFileName);
      const prdTemplate = this.generatePRDTemplate(task.label, task.description || "");
      await vscode.workspace.fs.writeFile(prdUri, Buffer.from(prdTemplate, "utf8"));

      // Update task file to link to PRD
      const relativePrdPath = `../${basePath}/${prdFileName}`;
      await this.taskParser.updateTaskPRD(taskId, relativePrdPath);

      // Open PRD for editing
      const document = await vscode.workspace.openTextDocument(prdUri);
      await vscode.window.showTextDocument(document);

      vscode.window.showInformationMessage(`PRD created: ${prdFileName}`);

      // Refresh to show updated PRD link
      await this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create PRD: ${error}`);
    }
  }

  private async handleEditPRD(prdPath: string) {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;

      // Get PRD base path from configuration
      const config = vscode.workspace.getConfiguration("kaiban.prd");
      const basePath = config.get<string>("basePath", ".agent/PRDS");

      // Resolve PRD path - Try configured base path first
      const basePathDir = path.basename(basePath);
      let relativePrdPath = prdPath;

      if (prdPath.includes(`${basePathDir}/`)) {
        const index = prdPath.indexOf(`${basePathDir}/`);
        relativePrdPath = prdPath.substring(index + basePathDir.length + 1);
      } else if (prdPath.startsWith("../") || prdPath.startsWith("./")) {
        const parts = prdPath.split("/");
        let startIndex = 0;
        for (let i = 0; i < parts.length; i++) {
          if (parts[i] !== ".." && parts[i] !== "." && parts[i] !== "") {
            startIndex = i;
            break;
          }
        }
        if (parts[startIndex] === basePathDir) {
          relativePrdPath = parts.slice(startIndex + 1).join("/");
        } else {
          relativePrdPath = parts.slice(startIndex).join("/");
        }
      }

      const baseUri = vscode.Uri.joinPath(workspaceFolders[0].uri, basePath);
      const prdUri = vscode.Uri.joinPath(baseUri, relativePrdPath);

      const document = await vscode.workspace.openTextDocument(prdUri);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open PRD: ${error}`);
    }
  }

  private async handleGetPrdRawContent(prdPath: string) {
    if (!this.panel) return;

    try {
      const prdUri = this.resolvePrdPath(prdPath);
      if (!prdUri) {
        this.panel.webview.postMessage({
          command: "prdRawContent",
          content: "",
          error: "Could not resolve PRD path",
        });
        return;
      }

      const content = await vscode.workspace.fs.readFile(prdUri);
      this.panel.webview.postMessage({
        command: "prdRawContent",
        content: Buffer.from(content).toString("utf-8"),
        prdPath: prdPath,
      });
    } catch (error) {
      this.panel.webview.postMessage({
        command: "prdRawContent",
        content: "",
        error: `Failed to read PRD: ${error}`,
      });
    }
  }

  private async handleSavePrdContent(prdPath: string, content: string) {
    if (!this.panel) return;

    try {
      const prdUri = this.resolvePrdPath(prdPath);
      if (!prdUri) {
        this.panel.webview.postMessage({
          command: "prdSaveResult",
          success: false,
          error: "Could not resolve PRD path",
        });
        return;
      }

      await vscode.workspace.fs.writeFile(prdUri, Buffer.from(content, "utf-8"));

      // Re-render the PRD preview with updated content
      const renderedContent = this.renderMarkdown(content);
      this.panel.webview.postMessage({
        command: "prdSaveResult",
        success: true,
        renderedContent: renderedContent,
      });
    } catch (error) {
      this.panel.webview.postMessage({
        command: "prdSaveResult",
        success: false,
        error: `Failed to save PRD: ${error}`,
      });
    }
  }

  private resolvePrdPath(prdPath: string): vscode.Uri | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return null;

    const config = vscode.workspace.getConfiguration("kaiban.prd");
    const basePath = config.get<string>("basePath", ".agent/PRDS");
    const basePathDir = path.basename(basePath);
    let relativePrdPath = prdPath;

    if (prdPath.includes(`${basePathDir}/`)) {
      const index = prdPath.indexOf(`${basePathDir}/`);
      relativePrdPath = prdPath.substring(index + basePathDir.length + 1);
    } else if (prdPath.startsWith("../") || prdPath.startsWith("./")) {
      const parts = prdPath.split("/");
      let startIndex = 0;
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] !== ".." && parts[i] !== "." && parts[i] !== "") {
          startIndex = i;
          break;
        }
      }
      if (parts[startIndex] === basePathDir) {
        relativePrdPath = parts.slice(startIndex + 1).join("/");
      } else {
        relativePrdPath = parts.slice(startIndex).join("/");
      }
    }

    const baseUri = vscode.Uri.joinPath(workspaceFolders[0].uri, basePath);
    return vscode.Uri.joinPath(baseUri, relativePrdPath);
  }

  private generatePRDTemplate(title: string, description: string): string {
    const now = new Date().toISOString().split("T")[0];
    return `# PRD: ${title}

**Created:** ${now}
**Status:** Draft

---

## Overview

${description || "Brief description of the feature/task."}

## Goals

- Goal 1
- Goal 2

## Requirements

### Functional Requirements

1. Requirement 1
2. Requirement 2

### Non-Functional Requirements

- Performance considerations
- Security considerations

## User Stories

As a [user type], I want [feature] so that [benefit].

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Out of Scope

- Items not included in this scope

## Technical Notes

Implementation details and considerations.

---

## Changelog

- ${now}: Initial draft
`;
  }

  private async updateTaskStatus(taskId: string, newStatus: string) {
    try {
      await this.taskParser.updateTaskStatus(
        taskId,
        newStatus as "Backlog" | "To Do" | "Doing" | "Testing" | "Done" | "Blocked"
      );
      // Refresh the board after updating
      await this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update task status: ${error}`);
    }
  }

  private async handleUpdateTaskOrder(
    taskId: string,
    order: number,
    newStatus?: string,
    startExecution?: boolean,
    stopExecution?: boolean
  ): Promise<void> {
    try {
      if (newStatus) {
        // If status changed, update both status and order
        await this.taskParser.updateTaskStatus(taskId, newStatus as Task["status"], order);
      } else {
        // Only update order
        await this.taskParser.updateTaskOrder(taskId, order);
      }

      // Handle execution start/stop based on status transition
      if (stopExecution) {
        // Stop terminal execution when moving out of Doing
        await this.handleStopClaudeExecution(taskId);
      } else if (startExecution) {
        // Start execution when moving to Doing (only if not already running)
        if (!this.claudeTerminals.has(taskId)) {
          await this.handleExecuteViaClaude(taskId);
        }
      }

      await this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update task order: ${error}`);
    }
  }

  private async handleUpdateTask(
    taskId: string,
    updates: {
      label?: string;
      description?: string;
      priority?: string;
      type?: string;
      status?: string;
    }
  ): Promise<void> {
    try {
      await this.taskParser.updateTask(taskId, updates);
      await this.refresh();
      if (this.panel) {
        this.panel.webview.postMessage({ command: "taskUpdated", taskId });
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update task: ${error}`);
      if (this.panel) {
        this.panel.webview.postMessage({
          command: "taskUpdateError",
          error: String(error),
        });
      }
    }
  }

  private async saveColumnSettings(columns: string[]) {
    try {
      // Set flag to skip the config change refresh (UI already updated)
      this.skipNextConfigRefresh = true;
      const config = vscode.workspace.getConfiguration("kaiban.columns");
      await config.update("enabled", columns, vscode.ConfigurationTarget.Workspace);
    } catch (error) {
      // Silently fail - the UI already updated instantly
      console.error("Failed to save column settings:", error);
      this.skipNextConfigRefresh = false;
    }
  }

  private async handleExecuteRalphCommand(taskId: string) {
    try {
      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Get ralph configuration
      const config = vscode.workspace.getConfiguration("kaiban.ralph");
      const ralphCommand = config.get<string>("command", "/ralph-loop");
      const maxIterations = config.get<number>("maxIterations", 5);
      const completionPromise = config.get<string>("completionPromise", "");

      // Load PRD content if available
      let prdContent = "";
      if (task.prdPath) {
        prdContent = await this.loadPRDContentRaw(task.prdPath);
      }

      // Build task description
      let taskDescription = `Task: ${task.label}`;
      if (task.description) {
        taskDescription += `\n\n${task.description}`;
      }
      if (prdContent) {
        taskDescription += `\n\nPRD Context:\n${prdContent.substring(0, 500)}${prdContent.length > 500 ? "..." : ""}`;
      }

      // Escape quotes in description for command
      const escapedDescription = taskDescription.replace(/"/g, '\\"');

      // Build command
      let command = "";
      if (ralphCommand.startsWith("/")) {
        // Claude Code plugin command format
        command = `${ralphCommand} "${escapedDescription}" --max-iterations ${maxIterations}`;
        if (completionPromise) {
          command += ` --completion-promise "${completionPromise}"`;
        }
      } else if (ralphCommand.includes("bash") || ralphCommand.endsWith(".sh")) {
        // Bash script format
        command = `${ralphCommand} "${escapedDescription}"`;
      } else {
        // Generic command format
        command = `${ralphCommand} "${escapedDescription}" --max-iterations ${maxIterations}`;
      }

      // Get or create terminal
      let terminal = vscode.window.activeTerminal;
      if (!terminal) {
        terminal = vscode.window.createTerminal("Ralph Loop");
      }

      // Show terminal and execute command
      terminal.show();
      terminal.sendText(command);

      // Notify user
      vscode.window.showInformationMessage(`Ralph command executed for task: ${task.label}`);

      // Notify webview of success
      if (this.panel) {
        this.panel.webview.postMessage({
          command: "ralphCommandExecuted",
          taskId,
        });
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to execute ralph command: ${error}`);
      if (this.panel) {
        this.panel.webview.postMessage({
          command: "ralphCommandError",
          taskId,
          error: String(error),
        });
      }
    }
  }

  /**
   * Get Claude execution configuration from workspace settings.
   */
  private getClaudeConfig() {
    const config = vscode.workspace.getConfiguration("kaiban");
    return {
      claudePath: config.get<string>("claude.executablePath", "claude"),
      additionalFlags: config.get<string>("claude.additionalFlags", ""),
      useRalphLoop: config.get<boolean>("claude.useRalphLoop", false),
      promptTemplate: config.get<string>(
        "claude.promptTemplate",
        "Read the task file at {taskFile} and implement it. The task contains a link to the PRD with full requirements. Update the task status to Testing when complete."
      ),
      ralphCommand: config.get<string>("ralph.command", "/ralph-loop:ralph-loop"),
      maxIterations: config.get<number>("ralph.maxIterations", 5),
      completionPromise: config.get<string>("ralph.completionPromise", "TASK COMPLETE"),
      executionTimeout: config.get<number>("claude.executionTimeout", 30),
    };
  }

  private claudeTerminals: Map<string, vscode.Terminal> = new Map();
  private completionWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private completionPollers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Execute task via CLI (backward compatibility - delegates to handleExecuteViaCLI)
   * Uses the configured default CLI provider or auto-detects
   */
  private async handleExecuteViaClaude(taskId: string) {
    // Delegate to the new multi-CLI handler
    await this.handleExecuteViaCLI(taskId);
  }

  private watchForCompletion(taskId: string) {
    // Watch task file for status changes
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const tasksPath = vscode.Uri.joinPath(workspaceFolders[0].uri, ".agent", "TASKS");
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(tasksPath, "**/*.md")
    );

    const checkCompletion = async () => {
      // Guard against race condition - if watcher is already cleaned up,
      // another trigger already processed this completion
      if (!this.completionWatchers.has(taskId)) return;

      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (task && (task.status === "Done" || task.status === "Testing")) {
        // Task completed - clean up (including terminal reference)
        this.cleanupTaskTracking(taskId, true);

        // Check if session documenter is enabled
        const skillSettings = this.skillService.getSettings();
        if (skillSettings.useSessionDocumenter) {
          // Prompt to document session
          const result = await vscode.window.showInformationMessage(
            `Task "${task.label}" completed! Document this session?`,
            "Document Session",
            "Skip"
          );

          if (result === "Document Session") {
            await this.skillService.runSessionDocumenter(task.label);
          }
        } else {
          vscode.window.showInformationMessage(`Task completed: ${task.label}`);
        }

        await this.refresh();
      }
    };

    watcher.onDidChange(checkCompletion);
    this.completionWatchers.set(taskId, watcher);
    this.context.subscriptions.push(watcher);

    // Also poll periodically (in case file watcher misses changes)
    const pollInterval = setInterval(async () => {
      await checkCompletion();
    }, 10000); // Check every 10 seconds

    this.completionPollers.set(taskId, pollInterval);

    // Clean up after configured timeout (default 30 minutes)
    const cfg = this.getClaudeConfig();
    const timeoutMs = cfg.executionTimeout * 60 * 1000;
    setTimeout(() => {
      this.cleanupTaskTracking(taskId);
    }, timeoutMs);
  }

  private cleanupTaskTracking(taskId: string, includeTerminal = false) {
    const watcher = this.completionWatchers.get(taskId);
    if (watcher) {
      watcher.dispose();
      this.completionWatchers.delete(taskId);
    }

    const poller = this.completionPollers.get(taskId);
    if (poller) {
      clearInterval(poller);
      this.completionPollers.delete(taskId);
    }

    // Stop transcript monitoring
    this.transcriptMonitorService.stopMonitoring(taskId);

    // Notify webview that progress tracking stopped
    if (this.panel) {
      this.panel.webview.postMessage({
        command: "claudeProgressStopped",
        taskId,
      });
    }

    if (includeTerminal) {
      this.claudeTerminals.delete(taskId);
    }
  }

  private async handleStopClaudeExecution(taskId: string) {
    const terminal = this.claudeTerminals.get(taskId);
    if (terminal) {
      terminal.dispose(); // Kill the terminal
      this.claudeTerminals.delete(taskId);
      this.cleanupTaskTracking(taskId);

      vscode.window.showInformationMessage("Stopped CLI execution");

      if (this.panel) {
        this.panel.webview.postMessage({
          command: "claudeExecutionStopped",
          taskId,
        });
      }
    }
  }

  // ============ Batch Execution Methods ============

  private async handleStartBatchExecution(taskIds: string[]) {
    if (this.isBatchExecuting) {
      vscode.window.showWarningMessage("Batch execution already in progress");
      return;
    }

    if (!taskIds || taskIds.length === 0) {
      vscode.window.showWarningMessage("No tasks to execute");
      return;
    }

    this.batchExecutionQueue = [...taskIds];
    this.currentBatchIndex = 0;
    this.isBatchExecuting = true;
    this.batchExecutionCancelled = false;
    this.batchCompletedCount = 0;
    this.batchSkippedCount = 0;

    // Notify webview
    if (this.panel) {
      this.panel.webview.postMessage({
        command: "batchExecutionStarted",
        total: taskIds.length,
        taskIds,
      });
    }

    vscode.window.showInformationMessage(`Starting batch execution of ${taskIds.length} tasks`);

    // Start first task
    await this.executeNextBatchTask();
  }

  private async executeNextBatchTask() {
    // Check if cancelled
    if (this.batchExecutionCancelled) {
      this.finishBatchExecution(true);
      return;
    }

    // Check if done
    if (this.currentBatchIndex >= this.batchExecutionQueue.length) {
      this.finishBatchExecution(false);
      return;
    }

    const taskId = this.batchExecutionQueue[this.currentBatchIndex];

    // Send progress update
    if (this.panel) {
      this.panel.webview.postMessage({
        command: "batchTaskStarted",
        taskId,
        index: this.currentBatchIndex,
        total: this.batchExecutionQueue.length,
      });

      this.panel.webview.postMessage({
        command: "batchExecutionProgress",
        current: this.currentBatchIndex + 1,
        total: this.batchExecutionQueue.length,
        completed: this.batchCompletedCount,
        skipped: this.batchSkippedCount,
      });
    }

    // Execute the task
    await this.executeBatchTask(taskId);
  }

  private async executeBatchTask(taskId: string) {
    try {
      // Check if task is already running to prevent duplicate execution
      if (this.claudeTerminals.has(taskId)) {
        // Skip this task and move to next
        this.batchSkippedCount++;
        if (this.panel) {
          this.panel.webview.postMessage({
            command: "batchTaskCompleted",
            taskId,
            success: false,
          });
        }
        this.currentBatchIndex++;
        await this.executeNextBatchTask();
        return;
      }

      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Get CLI status and selected provider
      const config = vscode.workspace.getConfiguration("kaiban");
      const selectionMode = config.get<CLISelectionMode>("cli.defaultProvider", "auto");
      const status =
        this.cachedCLIStatus ||
        (await this.cliDetectionService.getCLIAvailabilityStatus(selectionMode));

      if (!status.hasAvailableCLI || !status.selectedProvider) {
        throw new Error("No CLI available for batch execution");
      }

      const selectedCLI = status.selectedProvider;

      // Get CLI-specific configuration
      const cliConfig = this.cliDetectionService.getCLIConfig(selectedCLI, {
        get: <T>(key: string, defaultValue: T) => config.get<T>(key, defaultValue),
      });

      // Build command
      const taskInstruction = cliConfig.promptTemplate.replace("{taskFile}", task.filePath);
      const flags = cliConfig.additionalFlags ? `${cliConfig.additionalFlags} ` : "";
      let fullCommand: string;

      // For Claude, check if we should use ralph-loop
      if (selectedCLI === "claude") {
        const useRalphLoop = config.get<boolean>("claude.useRalphLoop", true);
        const ralphCommand = config.get<string>("ralph.command", "/ralph-loop:ralph-loop");
        const maxIterations = config.get<number>("ralph.maxIterations", 5);
        const completionPromise = config.get<string>("ralph.completionPromise", "TASK COMPLETE");

        if (useRalphLoop) {
          const escapedInstruction = taskInstruction.replace(/"/g, '\\"');
          const escapedPromise = completionPromise.replace(/"/g, '\\"');
          const ralphCmd = `${ralphCommand} \\"${escapedInstruction}\\" --completion-promise \\"${escapedPromise}\\" --max-iterations ${maxIterations}`;
          fullCommand = `${cliConfig.executablePath} ${flags}"${ralphCmd}"`;
        } else {
          fullCommand = `${cliConfig.executablePath} ${flags}"${taskInstruction}"`;
        }
      } else {
        fullCommand = `${cliConfig.executablePath} ${flags}"${taskInstruction}"`;
      }

      // Get workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const cwd = workspaceFolders?.[0]?.uri.fsPath;

      // Create terminal
      const terminalName = `Batch (${getCLIDisplayName(selectedCLI)}): ${task.label.substring(0, 15)}`;
      const terminal = vscode.window.createTerminal({
        name: terminalName,
        cwd: cwd,
      });

      // Store terminal reference
      this.claudeTerminals.set(taskId, terminal);

      terminal.show();
      terminal.sendText(fullCommand);

      // Update task status to Doing
      await this.taskParser.updateTaskStatus(taskId, "Doing");

      // Set up completion tracking for batch
      this.watchForBatchCompletion(taskId);

      // Start transcript monitoring for Claude CLI (real-time progress)
      if (selectedCLI === "claude" && cwd) {
        this.startTranscriptMonitoring(taskId, cwd);
      }

      // Refresh board
      await this.refresh();
    } catch (_error) {
      // Task failed - mark as skipped and continue
      this.batchSkippedCount++;

      if (this.panel) {
        this.panel.webview.postMessage({
          command: "batchTaskCompleted",
          taskId,
          success: false,
        });
      }

      // Move to next task
      this.currentBatchIndex++;
      await this.executeNextBatchTask();
    }
  }

  private watchForBatchCompletion(taskId: string) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const tasksPath = vscode.Uri.joinPath(workspaceFolders[0].uri, ".agent", "TASKS");
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(tasksPath, "**/*.md")
    );

    const checkCompletion = async () => {
      if (this.batchExecutionCancelled) return;

      // Guard against race condition - if watcher is already cleaned up,
      // another trigger already processed this completion
      if (!this.completionWatchers.has(taskId)) return;

      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (task && (task.status === "Done" || task.status === "Testing")) {
        // Task completed successfully
        this.cleanupTaskTracking(taskId, true);
        this.batchCompletedCount++;

        if (this.panel) {
          this.panel.webview.postMessage({
            command: "batchTaskCompleted",
            taskId,
            success: true,
          });
        }

        // Move to next task
        this.currentBatchIndex++;
        await this.executeNextBatchTask();
        await this.refresh();
      }
    };

    watcher.onDidChange(checkCompletion);
    this.completionWatchers.set(taskId, watcher);
    this.context.subscriptions.push(watcher);

    // Poll every 10 seconds (same as existing)
    const pollInterval = setInterval(async () => {
      await checkCompletion();
    }, 10000);

    this.completionPollers.set(taskId, pollInterval);

    // Timeout after configured time - skip task and continue
    const cfg = this.getClaudeConfig();
    const timeoutMs = cfg.executionTimeout * 60 * 1000;
    setTimeout(() => {
      if (this.completionWatchers.has(taskId) && this.isBatchExecuting) {
        this.cleanupTaskTracking(taskId, true);
        this.batchSkippedCount++;

        if (this.panel) {
          this.panel.webview.postMessage({
            command: "batchTaskCompleted",
            taskId,
            success: false,
          });
        }

        this.currentBatchIndex++;
        this.executeNextBatchTask();
      }
    }, timeoutMs);
  }

  private async handleCancelBatchExecution() {
    if (!this.isBatchExecuting) return;

    this.batchExecutionCancelled = true;

    // Stop current task's terminal
    const currentTaskId = this.batchExecutionQueue[this.currentBatchIndex];
    if (currentTaskId) {
      const terminal = this.claudeTerminals.get(currentTaskId);
      if (terminal) {
        terminal.dispose();
      }
      this.cleanupTaskTracking(currentTaskId, true);
    }

    vscode.window.showInformationMessage("Batch execution cancelled");
  }

  private finishBatchExecution(wasCancelled: boolean) {
    this.isBatchExecuting = false;

    const message = wasCancelled
      ? `Batch execution cancelled. Completed: ${this.batchCompletedCount}, Remaining: ${this.batchExecutionQueue.length - this.currentBatchIndex}`
      : `Batch execution complete. Completed: ${this.batchCompletedCount}, Skipped: ${this.batchSkippedCount}`;

    vscode.window.showInformationMessage(message);

    if (this.panel) {
      if (wasCancelled) {
        this.panel.webview.postMessage({
          command: "batchExecutionCancelled",
          current: this.currentBatchIndex,
          total: this.batchExecutionQueue.length,
          completed: this.batchCompletedCount,
        });
      } else {
        this.panel.webview.postMessage({
          command: "batchExecutionComplete",
          total: this.batchExecutionQueue.length,
          completed: this.batchCompletedCount,
          skipped: this.batchSkippedCount,
        });
      }
    }

    // Reset state
    this.batchExecutionQueue = [];
    this.currentBatchIndex = 0;
    this.batchCompletedCount = 0;
    this.batchSkippedCount = 0;

    // Final refresh
    this.refresh();
  }

  // ============ End Batch Execution Methods ============

  private async loadPRDContentRaw(prdPath: string): Promise<string> {
    // Get PRD base path from configuration
    const config = vscode.workspace.getConfiguration("kaiban.prd");
    const basePath = config.get<string>("basePath", ".agent/PRDS");

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return "";

    for (const folder of workspaceFolders) {
      // Extract relative path after base path directory
      let relativePrdPath = prdPath;
      const basePathDir = path.basename(basePath);

      if (prdPath.includes(`${basePathDir}/`)) {
        const index = prdPath.indexOf(`${basePathDir}/`);
        relativePrdPath = prdPath.substring(index + basePathDir.length + 1);
      } else if (prdPath.startsWith("../") || prdPath.startsWith("./")) {
        const parts = prdPath.split("/");
        let startIndex = 0;
        for (let i = 0; i < parts.length; i++) {
          if (parts[i] !== ".." && parts[i] !== "." && parts[i] !== "") {
            startIndex = i;
            break;
          }
        }
        if (parts[startIndex] === basePathDir) {
          relativePrdPath = parts.slice(startIndex + 1).join("/");
        } else {
          relativePrdPath = parts.slice(startIndex).join("/");
        }
      }

      // Resolve from configured base path
      try {
        const baseUri = vscode.Uri.joinPath(folder.uri, basePath);
        const prdUri = vscode.Uri.joinPath(baseUri, relativePrdPath);
        const document = await vscode.workspace.openTextDocument(prdUri);
        return document.getText();
      } catch {}

      // Fallback: resolve relative to workspace root
      if (!prdPath.startsWith("/") && !prdPath.startsWith("http")) {
        try {
          const prdUri = vscode.Uri.joinPath(folder.uri, prdPath);
          const document = await vscode.workspace.openTextDocument(prdUri);
          return document.getText();
        } catch {}
      }
    }
    return "";
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

  private async getWebviewContent(groupedTasks: Record<string, Task[]>): Promise<string> {
    // All possible columns
    const allColumns = ["Backlog", "To Do", "Doing", "Testing", "Done", "Blocked"];

    // Get configured columns from settings
    const config = vscode.workspace.getConfiguration("kaiban.columns");
    const enabledColumns = config.get<string[]>("enabled", ["To Do", "Doing", "Testing", "Done"]);

    // Sort function: Order first (ascending), then priority (High > Medium > Low)
    const sortTasksByOrderAndPriority = (tasks: Task[]) => {
      const priorityOrder = { High: 0, Medium: 1, Low: 2 };
      return tasks.sort((a, b) => {
        // If both have order, sort by order first
        if (a.order !== undefined && b.order !== undefined) {
          if (a.order !== b.order) {
            return a.order - b.order;
          }
          // Same order, fallback to priority
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        // If only one has order, it comes first
        if (a.order !== undefined && b.order === undefined) {
          return -1;
        }
        if (a.order === undefined && b.order !== undefined) {
          return 1;
        }
        // Neither has order, sort by priority
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    };

    // Sort tasks for ALL columns (not just enabled ones)
    const columnTasks: Record<string, Task[]> = {};
    let totalTasks = 0;
    for (const column of allColumns) {
      const sorted = sortTasksByOrderAndPriority([...(groupedTasks[column] || [])]);
      columnTasks[column] = sorted;
      // Only count tasks in enabled columns for isEmpty check
      if (enabledColumns.includes(column)) {
        totalTasks += sorted.length;
      }
    }

    const isEmpty = totalTasks === 0;

    // Track which tasks are currently running via Claude terminal
    const runningTaskIds = new Set(this.claudeTerminals.keys());

    const renderTask = (task: Task) => {
      const priorityClass = task.priority.toLowerCase();
      const completedClass = task.completed ? "completed" : "";
      const isInTesting = task.status === "Testing";
      const isInToDo = task.status === "To Do";
      const isInDoing = task.status === "Doing";
      // Check if task is running via Claude terminal (but not if already Done)
      const isRunningViaClaude = runningTaskIds.has(task.id) && task.status !== "Done";
      const runningClass = isRunningViaClaude ? "running" : "";
      const canExecuteViaClaude =
        (isInToDo || isInDoing || isInTesting) && !isRunningViaClaude && task.status !== "Done";

      return `
        <div class="task-card ${priorityClass} ${completedClass} ${runningClass}"
             draggable="true"
             data-filepath="${task.filePath}"
             data-task-id="${task.id}"
             data-prd-path="${this.escapeHtml(task.prdPath || "")}"
             data-status="${task.status}"
             data-label="${this.escapeHtml(task.label)}"
             data-description="${this.escapeHtml(task.description || "")}"
             data-order="${task.order !== undefined ? task.order : ""}">
          <div class="task-header">
            <span class="task-title">${this.escapeHtml(task.label)}</span>
            ${canExecuteViaClaude || isRunningViaClaude ? `<button class="play-stop-btn${isRunningViaClaude ? " running" : ""}" onclick="event.stopPropagation(); toggleExecution('${task.id}')" title="${isRunningViaClaude ? "Stop execution" : "Execute via Claude CLI"}">${isRunningViaClaude ? "⏹" : "▶"}</button>${!isRunningViaClaude ? `<button class="rate-limit-btn" onclick="event.stopPropagation(); triggerRateLimitFromUI('${task.id}')" title="Set rate limit wait timer">⏱</button>` : ""}` : ""}
          </div>
          <div class="task-meta">
            <span class="badge priority-${priorityClass}">${task.priority}</span>
            <span class="badge type">${task.type}</span>
            ${task.rejectionCount > 0 ? `<span class="badge rejection-badge">${Icons.rotateCcw(14)} ${task.rejectionCount}</span>` : ""}
          </div>
          <div class="task-footer">
            <span class="project-name">${this.escapeHtml(task.project)}</span>
          </div>
        </div>
      `;
    };

    // Get webview URIs for external CSS and JS files
    const styleUri = this.panel?.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "styles.css")
    );
    const scriptUri = this.panel?.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "kanban.js")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kanban Board</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <div class="header">
      <div class="title">Kaiban Board</div>
      <!-- Claude Quota Widget -->
      <div class="quota-widget" id="quotaWidget">
        <div class="quota-loading" id="quotaLoading">
          ${Icons.refresh(14)} Loading...
        </div>
        <div class="quota-content" id="quotaContent" style="display: none;">
          <!-- Primary bar (always visible) -->
          <div class="quota-primary">
            <span class="quota-label">5h</span>
            <div class="quota-bar">
              <div class="quota-bar-fill" id="quota5h" data-status="good"></div>
            </div>
            <span class="quota-value" id="quota5hValue">0%</span>
          </div>
          <!-- Expanded bars (visible on hover) -->
          <div class="quota-expanded">
            <div class="quota-bar-group" title="7-day weekly limit">
              <span class="quota-label">7d</span>
              <div class="quota-bar">
                <div class="quota-bar-fill" id="quota7d" data-status="good"></div>
              </div>
              <span class="quota-value" id="quota7dValue">0%</span>
            </div>
            <div class="quota-bar-group quota-sonnet-group" id="quotaSonnetGroup" title="7-day Sonnet limit">
              <span class="quota-label">S</span>
              <div class="quota-bar">
                <div class="quota-bar-fill" id="quotaSonnet" data-status="good"></div>
              </div>
              <span class="quota-value" id="quotaSonnetValue">0%</span>
            </div>
            <button class="quota-refresh-btn" onclick="refreshClaudeQuota()" title="Refresh quota">
              ${Icons.refresh(12)}
            </button>
          </div>
        </div>
        <div class="quota-error" id="quotaError" style="display: none;">
          <span class="quota-error-text" id="quotaErrorText"></span>
        </div>
      </div>
      ${
        !isEmpty
          ? `<div class="header-actions">
        <button class="action-btn secondary-btn icon-btn" onclick="createTask()" title="Create new task">
          ${Icons.plus(16)}
        </button>
        <select class="action-btn secondary-btn" id="sortSelect" onchange="onSortChange()" title="Sort tasks">
          <option value="order-asc">Order ↑</option>
          <option value="order-desc">Order ↓</option>
          <option value="priority-asc">Priority ↑</option>
          <option value="priority-desc">Priority ↓</option>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
        </select>
        <div class="settings-dropdown">
          <button class="action-btn secondary-btn icon-btn" onclick="toggleSettingsPanel(event)" title="Settings">
            ${Icons.settings(16)}
          </button>
          <div class="settings-panel" id="settingsPanel" onclick="event.stopPropagation()">
            <h4>Columns</h4>
            ${allColumns
              .map(
                (col) => `
            <label class="column-toggle" onclick="event.stopPropagation()">
              <input type="checkbox"
                     data-column="${col}"
                     ${enabledColumns.includes(col) ? "checked" : ""}
                     onchange="event.stopPropagation(); toggleColumn('${col}', this.checked)">
              ${col}
            </label>`
              )
              .join("")}
            <div class="settings-divider"></div>
            <a class="settings-link" onclick="openSettings()">More Settings...</a>
          </div>
        </div>
        <button class="action-btn secondary-btn icon-btn" onclick="refresh()" title="Refresh">
          ${Icons.refresh(16)}
        </button>
      </div>`
          : ""
      }
    </div>

  <div class="board" id="kanbanBoard">
    ${
      isEmpty
        ? `
    <div style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; padding: 40px;">
      <div class="empty-state-setup">
        <h3>Welcome to Kaiban Board!</h3>
        <p>Get started by creating your first task. Here's how:</p>
        <ol>
          <li>Create the folder structure in your workspace root:
            <br><code>mkdir -p .agent/TASKS .agent/PRDS</code>
          </li>
          <li>Create a task file in <code>.agent/TASKS/</code> (e.g., <code>my-task.md</code>)</li>
          <li>Use this template:
            <pre style="background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 6px; margin-top: 8px; text-align: left; font-size: 12px; overflow-x: auto;"><code>## Task: My Task Title

**ID:** task-001
**Label:** My Task Title
**Description:** Task description
**Type:** Feature
**Status:** To Do
**Priority:** Medium
**Created:** ${new Date().toISOString().split("T")[0]}
**Updated:** ${new Date().toISOString().split("T")[0]}
**PRD:** [Link](../PRDS/my-task-prd.md)

---

## Additional Notes
Your task details here...</code></pre>
          </li>
          <li>Click <strong>Refresh</strong> below to see your task appear!</li>
        </ol>
        <div class="onboarding-actions" style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
          <button class="action-btn secondary-btn" onclick="openExtensionSettings()" title="Settings">
            ${Icons.settings(16)} Settings
          </button>
          <button class="action-btn primary-btn" onclick="refresh()" title="Refresh">
            ${Icons.refresh(16)} Refresh
          </button>
        </div>
        <p style="margin-top: 16px; font-size: 13px; color: var(--vscode-descriptionForeground);">
          See the README for detailed setup instructions and examples.
        </p>
      </div>
    </div>
        `
        : `
${allColumns
  .map((column) => {
    const tasks = columnTasks[column];
    const columnClass = column.toLowerCase().replace(/\s+/g, "-");
    const isHidden = !enabledColumns.includes(column);
    const emptyMessages: Record<string, string> = {
      Backlog: "No tasks in backlog",
      "To Do": "No tasks to do",
      Doing: "No tasks in progress",
      Testing: "No tasks in testing",
      Done: "No completed tasks",
      Blocked: "No blocked tasks",
    };
    const emptyMessage = emptyMessages[column];

    return `
    <div class="column column-${columnClass}${isHidden ? " hidden" : ""}" data-status="${column}">
      <div class="column-header">
        <span>${column}</span>
        <div class="column-header-actions">
          ${
            column === "To Do" && tasks.length > 0
              ? `<button class="play-all-btn" onclick="event.stopPropagation(); toggleBatchExecution()" title="Execute all tasks via Claude CLI">
                  ${Icons.play(12)} Play All
                </button>`
              : ""
          }
          <span class="column-count">${tasks.length}</span>
        </div>
      </div>
      <div class="column-content">
        ${
          tasks.length > 0
            ? tasks.map(renderTask).join("")
            : `<div class="empty-state">${emptyMessage}</div>`
        }
      </div>
    </div>`;
  })
  .join("")}
        `
    }

    <div class="prd-sidebar" id="prdPanel" style="display: none; visibility: hidden;">
      <div class="prd-header">
        <span id="prdHeaderTitle">PRD Preview</span>
        <div class="prd-actions">
          <!-- View mode buttons -->
          <button class="edit-prd-btn" id="editPrdBtn" onclick="togglePrdEditMode()" title="Edit PRD" style="display: none;">${Icons.edit(14)} Edit</button>
          <button class="create-prd-btn" id="createPrdBtn" onclick="createPRD()" title="Create PRD" style="display: none;">${Icons.plus(14)} Create PRD</button>
          <button class="play-prd-btn" id="playPrdBtn" onclick="executePRD()" title="Execute via Claude CLI" style="display: none;">▶ Execute</button>
          <!-- Edit mode buttons -->
          <button class="edit-btn edit-btn-cancel" id="cancelPrdBtn" onclick="cancelPrdEdit()" style="display: none;">Cancel</button>
          <button class="edit-btn edit-btn-save" id="savePrdBtn" onclick="savePrdEdit()" style="display: none;">Save</button>
          <button class="close-prd-btn" onclick="closePRD()" title="Close PRD Panel">×</button>
        </div>
      </div>
      <!-- PRD Edit Container (hidden by default) -->
      <div class="prd-edit-container" id="prdEditContainer" style="display: none;">
        <textarea class="prd-edit-textarea" id="prdEditTextarea" placeholder="Write your PRD in markdown..."></textarea>
      </div>
      <div class="prd-content" id="prdContent">
        <div class="prd-placeholder">Select a task to view its PRD</div>
      </div>
    </div>

    <div class="terminal-panel" id="terminalPanel" style="display: none; visibility: hidden;">
      <div class="terminal-header">
        <div class="terminal-title">
          <span>Terminal</span>
        </div>
        <div class="terminal-actions">
          <button class="terminal-btn" id="terminalClearBtn" onclick="clearTerminal()" title="Clear terminal">Clear</button>
          <button class="terminal-btn" id="terminalToggleBtn" onclick="toggleTerminal()" title="Collapse/Expand terminal">−</button>
          <button class="terminal-btn" id="terminalCloseBtn" onclick="closeTerminal()" title="Close terminal">×</button>
        </div>
      </div>
      <div class="terminal-content" id="terminalContent">
        <div class="terminal-output-line info">Terminal ready. Execute commands to see output here.</div>
      </div>
    </div>
  </div>

  <!-- Stop Execution Confirmation Modal -->
  <div class="modal-overlay" id="stopExecutionModal" style="display: none;">
    <div class="modal">
      <h3>Stop Task Execution?</h3>
      <p>Moving "<span id="stopExecutionTaskName"></span>" out of the Doing column will stop the terminal execution and interrupt the task.</p>
      <p style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 8px;">Are you sure you want to continue?</p>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" id="stopExecutionCancel" onclick="cancelStopExecution()">Cancel</button>
        <button class="modal-btn modal-btn-send" id="stopExecutionConfirm" onclick="confirmStopExecution()">Stop & Move</button>
      </div>
    </div>
  </div>

  <!-- Batch Progress Banner -->
  <div class="batch-progress-banner" id="batchProgressBanner" style="display: none;">
    <div class="batch-progress-content">
      <span class="batch-progress-icon">${Icons.rotateCcw(16)}</span>
      <span>Running: <span id="batchProgressCurrent">0</span>/<span id="batchProgressTotal">0</span></span>
      <span class="batch-progress-stats">(Completed: <span id="batchCompleted">0</span>, Skipped: <span id="batchSkipped">0</span>)</span>
    </div>
    <button class="batch-cancel-btn" onclick="cancelBatchExecution()">Cancel</button>
  </div>

  <!-- Rate Limit Banner -->
  <div class="rate-limit-banner" id="rateLimitBanner">
    <div class="rate-limit-banner-content">
      <span>${Icons.clock(20)}</span>
      <span class="rate-limit-banner-timer" id="rateLimitTimer">00:00</span>
      <span class="rate-limit-banner-task">Rate limit - waiting to retry: <span id="rateLimitTaskName"></span></span>
    </div>
    <div class="rate-limit-banner-actions">
      <button class="retry-btn" onclick="retryRateLimitNow()">Retry Now</button>
      <button class="cancel-btn" onclick="cancelRateLimitWait()">Cancel</button>
    </div>
  </div>
  <script src="${scriptUri}"></script>
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
