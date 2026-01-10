import * as path from "node:path";
import * as vscode from "vscode";
import { CursorCloudAdapter } from "./adapters/cursorCloudAdapter";
import { OpenAIAdapter } from "./adapters/openaiAdapter";
import { OpenRouterAdapter } from "./adapters/openrouterAdapter";
import { ReplicateAdapter } from "./adapters/replicateAdapter";
import type { ApiKeyManager } from "./config/apiKeyManager";
import { ProviderRegistry } from "./services/providerRegistry";
import { SkillService } from "./services/skillService";
import { type Task, TaskParser } from "./taskParser";
import type { ProviderType, TaskPrompt } from "./types/aiProvider";
import { Icons } from "./utils/lucideIcons";

export class KanbanViewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private taskParser: TaskParser;
  private providerRegistry: ProviderRegistry;
  private skillService: SkillService;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private skipNextConfigRefresh = false;

  // Batch execution state
  private batchExecutionQueue: string[] = [];
  private currentBatchIndex = 0;
  private isBatchExecuting = false;
  private batchExecutionCancelled = false;
  private batchCompletedCount = 0;
  private batchSkippedCount = 0;

  constructor(
    private context: vscode.ExtensionContext,
    apiKeyManager?: ApiKeyManager
  ) {
    this.taskParser = new TaskParser();
    this.skillService = new SkillService();
    // biome-ignore lint/style/noNonNullAssertion: apiKeyManager is checked before use
    this.providerRegistry = new ProviderRegistry(apiKeyManager!);

    // Register adapters
    if (apiKeyManager) {
      this.providerRegistry.registerAdapter(
        new OpenRouterAdapter(() => apiKeyManager.getApiKey("openrouter"))
      );

      this.providerRegistry.registerAdapter(
        new OpenAIAdapter(() => apiKeyManager.getApiKey("openai"))
      );

      this.providerRegistry.registerAdapter(
        new CursorCloudAdapter(() => apiKeyManager.getApiKey("cursor"))
      );

      this.providerRegistry.registerAdapter(
        new ReplicateAdapter(() => apiKeyManager.getApiKey("replicate"))
      );
    }

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
          case "openSettings":
            await vscode.commands.executeCommand("kaiban.configurePRDPath");
            break;
          case "loadPRD":
            await this.loadPRDContent(message.prdPath, message.taskFilePath);
            break;
          case "updateTaskStatus":
            await this.updateTaskStatus(message.taskId, message.newStatus);
            break;
          case "updateTaskOrder":
            await this.handleUpdateTaskOrder(message.taskId, message.order, message.newStatus);
            break;
          case "getAvailableProviders":
            await this.handleGetAvailableProviders();
            break;
          case "getModelsForProvider":
            await this.handleGetModelsForProvider(message.provider);
            break;
          case "prepareAgentPrompt":
            await this.handlePrepareAgentPrompt(message.taskId);
            break;
          case "sendToAgent":
            await this.handleSendToAgent(message.taskId, message.provider, message.model);
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
          case "startBatchExecution":
            await this.handleStartBatchExecution(message.taskIds);
            break;
          case "cancelBatchExecution":
            await this.handleCancelBatchExecution();
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

    // Check if any API keys are configured
    const hasAnyApiKey = await this.providerRegistry
      .getEnabledAdapters()
      .then((adapters) => adapters.length > 0);

    this.panel.webview.html = await this.getWebviewContent(groupedTasks, hasAnyApiKey);
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
      return;
    }

    try {
      // Get PRD base path from configuration
      const config = vscode.workspace.getConfiguration("kaiban.prd");
      const basePath = config.get<string>("basePath", ".agent/PRDS");

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
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
          const document = await vscode.workspace.openTextDocument(prdUri);
          prdContent = document.getText();
          if (prdContent) break;
        } catch (_error) {}

        // Strategy 2: Fallback - resolve relative to task file if available
        if (taskFilePath && !prdContent) {
          try {
            const taskDir = path.dirname(taskFilePath);
            const resolvedPath = path.resolve(taskDir, prdPath);
            const prdUri = vscode.Uri.file(resolvedPath);
            const document = await vscode.workspace.openTextDocument(prdUri);
            prdContent = document.getText();
            if (prdContent) break;
          } catch (_error) {}
        }

        // Strategy 3: Fallback - resolve relative to workspace root
        if (!prdContent && !prdPath.startsWith("/") && !prdPath.startsWith("http")) {
          try {
            const prdUri = vscode.Uri.joinPath(folder.uri, prdPath);
            const document = await vscode.workspace.openTextDocument(prdUri);
            prdContent = document.getText();
            if (prdContent) break;
          } catch (_error) {}
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
          content: `<p>PRD file not found. Tried: ${prdPath}</p>`,
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
    newStatus?: string
  ): Promise<void> {
    try {
      if (newStatus) {
        // If status changed, update both status and order
        await this.taskParser.updateTaskStatus(
          taskId,
          newStatus as Task["status"],
          order
        );
      } else {
        // Only update order
        await this.taskParser.updateTaskOrder(taskId, order);
      }
      await this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update task order: ${error}`);
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

  // AI Provider handlers
  private async handleGetAvailableProviders() {
    if (!this.panel) return;

    try {
      const providers = await this.providerRegistry.getAvailableProviders();
      this.panel.webview.postMessage({
        command: "availableProviders",
        providers,
      });
    } catch (error) {
      this.panel.webview.postMessage({
        command: "providerError",
        error: String(error),
      });
    }
  }

  private async handleGetModelsForProvider(provider: ProviderType) {
    if (!this.panel) return;

    try {
      const adapter = this.providerRegistry.getAdapter(provider);
      if (!adapter) {
        throw new Error(`Provider ${provider} not found`);
      }

      const models = await adapter.getAvailableModels();
      this.panel.webview.postMessage({
        command: "updateModelsForProvider",
        provider,
        models,
      });
    } catch (error) {
      this.panel.webview.postMessage({
        command: "updateModelsForProvider",
        models: [],
        error: String(error),
      });
    }
  }

  private async handlePrepareAgentPrompt(taskId: string) {
    if (!this.panel) return;

    try {
      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Check if already claimed
      if (task.claimedBy) {
        throw new Error(`Task is already claimed by ${task.claimedBy}`);
      }

      // Load PRD content if available
      let prdContent = "";
      if (task.prdPath) {
        prdContent = await this.loadPRDContentRaw(task.prdPath);
      }

      // Get available providers
      const providers = await this.providerRegistry.getAvailableProviders();

      this.panel.webview.postMessage({
        command: "showAgentModal",
        task: {
          id: task.id,
          label: task.label,
          description: task.description,
          type: task.type,
          priority: task.priority,
          prdContent,
          rejectionHistory: task.agentNotes,
          filePath: task.filePath,
        },
        providers,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Error preparing agent: ${error}`);
    }
  }

  private async handleSendToAgent(taskId: string, provider: ProviderType, model?: string) {
    if (!this.panel) return;

    try {
      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Double-check not already claimed
      if (task.claimedBy) {
        throw new Error(`Task is already claimed by ${task.claimedBy}`);
      }

      const adapter = this.providerRegistry.getAdapter(provider);
      if (!adapter) {
        throw new Error(`Provider ${provider} not available`);
      }

      // Load PRD content
      let prdContent = "";
      if (task.prdPath) {
        prdContent = await this.loadPRDContentRaw(task.prdPath);
      }

      const taskPrompt: TaskPrompt = {
        title: task.label,
        description: task.description,
        type: task.type,
        priority: task.priority,
        prdContent,
        rejectionHistory: task.agentNotes,
        filePath: task.filePath,
      };

      // Send to agent
      const response = await adapter.sendTask(taskPrompt, { model });

      if (response.status === "error") {
        this.panel.webview.postMessage({
          command: "agentSendError",
          taskId,
          error: response.error,
        });
        return;
      }

      // Notify webview of success
      this.panel.webview.postMessage({
        command: "agentSendSuccess",
        taskId,
        agentId: response.id,
        provider,
        model,
      });

      vscode.window.showInformationMessage(
        `Task sent to ${adapter.displayName}${response.branchName ? ` (Branch: ${response.branchName})` : ""}`
      );

      // If provider supports agent mode (like Cursor), start polling
      if (adapter.supportsAgentMode && adapter.checkStatus && response.id) {
        this.startAgentPolling(taskId, response.id, provider);
      }

      await this.refresh();
    } catch (error) {
      this.panel?.webview.postMessage({
        command: "agentSendError",
        taskId,
        error: String(error),
      });
      vscode.window.showErrorMessage(`Failed to send to agent: ${error}`);
    }
  }

  private startAgentPolling(taskId: string, agentId: string, provider: ProviderType) {
    // Poll every 30 seconds
    const interval = setInterval(async () => {
      try {
        const adapter = this.providerRegistry.getAdapter(provider);
        if (!adapter?.checkStatus) {
          this.stopAgentPolling(taskId);
          return;
        }

        const status = await adapter.checkStatus(agentId);

        if (status.status === "completed" || status.status === "error") {
          this.stopAgentPolling(taskId);
          await this.refresh();

          if (status.status === "completed") {
            const message = status.prUrl
              ? `Agent completed! PR: ${status.prUrl}`
              : "Agent completed the task!";

            const action = status.prUrl ? "View PR" : undefined;
            const selection = action
              ? await vscode.window.showInformationMessage(message, action)
              : await vscode.window.showInformationMessage(message);

            if (selection === "View PR" && status.prUrl) {
              vscode.env.openExternal(vscode.Uri.parse(status.prUrl));
            }
          } else {
            vscode.window.showWarningMessage(`Agent encountered an error: ${status.error}`);
          }
        }
      } catch (error) {
        console.error("Error polling agent status:", error);
      }
    }, 30000);

    this.pollingIntervals.set(taskId, interval);
  }

  private stopAgentPolling(taskId: string) {
    const interval = this.pollingIntervals.get(taskId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(taskId);
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

  private claudeTerminals: Map<string, vscode.Terminal> = new Map();
  private completionWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private completionPollers: Map<string, NodeJS.Timeout> = new Map();

  private async handleExecuteViaClaude(taskId: string) {
    try {
      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Get configuration
      const config = vscode.workspace.getConfiguration("kaiban");
      const claudePath = config.get<string>("claude.executablePath", "claude");
      const additionalFlags = config.get<string>("claude.additionalFlags", "");
      const useRalphLoop = config.get<boolean>("claude.useRalphLoop", false);
      const promptTemplate = config.get<string>(
        "claude.promptTemplate",
        "Read the task file at {taskFile} and implement it. The task contains a link to the PRD with full requirements. Update the task status to Done when complete."
      );
      const ralphCommand = config.get<string>("ralph.command", "/ralph-loop:ralph-loop");
      const maxIterations = config.get<number>("ralph.maxIterations", 5);
      const completionPromise = config.get<string>("ralph.completionPromise", "TASK COMPLETE");

      // Build task instruction from template
      const taskInstruction = promptTemplate.replace("{taskFile}", task.filePath);

      // Build the command based on whether to use ralph-loop
      const flags = additionalFlags ? `${additionalFlags} ` : "";
      let fullCommand: string;

      if (useRalphLoop) {
        // Use ralph-loop plugin
        const ralphCmd = `${ralphCommand} "${taskInstruction}" --completion-promise "${completionPromise}" --max-iterations ${maxIterations}`;
        fullCommand = `${claudePath} ${flags}"${ralphCmd}"`;
      } else {
        // Run Claude directly with the prompt
        fullCommand = `${claudePath} ${flags}"${taskInstruction}"`;
      }

      // Get workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const cwd = workspaceFolders?.[0]?.uri.fsPath;

      // Create terminal
      const terminalName = `Claude: ${task.label.substring(0, 20)}`;
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
      vscode.window.showInformationMessage(`Executing via Claude: ${task.label}`);

      // Notify webview
      if (this.panel) {
        this.panel.webview.postMessage({
          command: "claudeExecutionStarted",
          taskId,
        });
      }

      // Set up completion tracking
      this.watchForCompletion(taskId);

      // Refresh board to show updated status
      await this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to execute via Claude: ${error}`);
      if (this.panel) {
        this.panel.webview.postMessage({
          command: "claudeExecutionError",
          taskId,
          error: String(error),
        });
      }
    }
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
      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (task && (task.status === "Done" || task.status === "Testing")) {
        // Task completed - clean up
        this.cleanupCompletionTracking(taskId);

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

    // Clean up after 30 minutes max
    setTimeout(
      () => {
        this.cleanupCompletionTracking(taskId);
      },
      30 * 60 * 1000
    );
  }

  private cleanupCompletionTracking(taskId: string) {
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
  }

  private async handleStopClaudeExecution(taskId: string) {
    const terminal = this.claudeTerminals.get(taskId);
    if (terminal) {
      terminal.dispose(); // Kill the terminal
      this.claudeTerminals.delete(taskId);
      this.cleanupCompletionTracking(taskId);

      vscode.window.showInformationMessage("Stopped Claude execution");

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
      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Get configuration (same pattern as handleExecuteViaClaude)
      const config = vscode.workspace.getConfiguration("kaiban");
      const claudePath = config.get<string>("claude.executablePath", "claude");
      const additionalFlags = config.get<string>("claude.additionalFlags", "");
      const useRalphLoop = config.get<boolean>("claude.useRalphLoop", true);
      const promptTemplate = config.get<string>(
        "claude.promptTemplate",
        "Read the task file at {taskFile} and implement it. The task contains a link to the PRD with full requirements. Update the task status to Done when complete."
      );
      const ralphCommand = config.get<string>("ralph.command", "/ralph-loop:ralph-loop");
      const maxIterations = config.get<number>("ralph.maxIterations", 5);
      const completionPromise = config.get<string>("ralph.completionPromise", "TASK COMPLETE");

      // Build command
      const taskInstruction = promptTemplate.replace("{taskFile}", task.filePath);
      const flags = additionalFlags ? `${additionalFlags} ` : "";
      let fullCommand: string;

      if (useRalphLoop) {
        const escapedInstruction = taskInstruction.replace(/"/g, '\\"');
        const escapedPromise = completionPromise.replace(/"/g, '\\"');
        const ralphCmd = `${ralphCommand} \\"${escapedInstruction}\\" --completion-promise \\"${escapedPromise}\\" --max-iterations ${maxIterations}`;
        fullCommand = `${claudePath} ${flags}"${ralphCmd}"`;
      } else {
        fullCommand = `${claudePath} ${flags}"${taskInstruction}"`;
      }

      // Get workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const cwd = workspaceFolders?.[0]?.uri.fsPath;

      // Create terminal
      const terminalName = `Batch: ${task.label.substring(0, 20)}`;
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

      const tasks = await this.taskParser.parseTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (task && (task.status === "Done" || task.status === "Testing")) {
        // Task completed successfully
        this.cleanupBatchTaskTracking(taskId);
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

    // Timeout after 30 minutes - skip task and continue
    setTimeout(
      () => {
        if (this.completionWatchers.has(taskId) && this.isBatchExecuting) {
          this.cleanupBatchTaskTracking(taskId);
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
      },
      30 * 60 * 1000
    );
  }

  private cleanupBatchTaskTracking(taskId: string) {
    // Clean up watcher
    const watcher = this.completionWatchers.get(taskId);
    if (watcher) {
      watcher.dispose();
      this.completionWatchers.delete(taskId);
    }

    // Clean up poller
    const poller = this.completionPollers.get(taskId);
    if (poller) {
      clearInterval(poller);
      this.completionPollers.delete(taskId);
    }

    // Clean up terminal reference
    this.claudeTerminals.delete(taskId);
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
      this.cleanupBatchTaskTracking(currentTaskId);
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

  private async getWebviewContent(
    groupedTasks: Record<string, Task[]>,
    hasAnyApiKey: boolean = false
  ): Promise<string> {
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

    const renderTask = (task: Task) => {
      const priorityClass = task.priority.toLowerCase();
      const completedClass = task.completed ? "completed" : "";
      const isInTesting = task.status === "Testing";
      const isInToDo = task.status === "To Do";
      const isInDoing = task.status === "Doing";
      const hasAgent = task.claimedBy && task.claimedBy.length > 0;
      const agentPlatform = hasAgent ? task.claimedBy.split("-")[0] : "";
      const canSendToAgent =
        hasAnyApiKey &&
        (isInToDo || isInDoing || isInTesting) &&
        !hasAgent &&
        task.agentStatus !== "running";
      const isAgentRunning = task.agentStatus === "running";
      const agentStatusClass = task.agentStatus ? `agent-${task.agentStatus}` : "";
      const canExecuteViaClaude =
        (isInToDo || isInDoing || isInTesting) && !isAgentRunning && task.status !== "Done";

      return `
        <div class="task-card ${priorityClass} ${completedClass} ${agentStatusClass}"
             draggable="true"
             data-filepath="${task.filePath}"
             data-task-id="${task.id}"
             data-prd-path="${task.prdPath}"
             data-status="${task.status}"
             data-label="${this.escapeHtml(task.label)}"
             data-description="${this.escapeHtml(task.description || "")}"
             data-order="${task.order !== undefined ? task.order : ""}">
          <div class="task-header">
            <span class="task-title">${this.escapeHtml(task.label)}</span>
            ${canExecuteViaClaude ? `<button class="play-stop-btn" onclick="event.stopPropagation(); toggleExecution('${task.id}')" title="Execute via Claude CLI">▶</button><button class="rate-limit-btn" onclick="event.stopPropagation(); triggerRateLimitFromUI('${task.id}')" title="Set rate limit wait timer">⏱</button>` : ""}
            ${task.completed ? '<span class="task-check">[Done]</span>' : ""}
          </div>
          <div class="task-meta">
            <span class="badge priority-${priorityClass}">${task.priority}</span>
            <span class="badge type">${task.type}</span>
            ${hasAgent ? `<span class="badge agent-badge ${agentPlatform}">${Icons.bot(14)} ${agentPlatform}</span>` : ""}
            ${isAgentRunning ? `<span class="badge agent-running-badge">${Icons.refresh(14)} Running</span>` : ""}
            ${task.agentProvider ? `<span class="badge provider-badge provider-${task.agentProvider}">${task.agentProvider}</span>` : ""}
            ${task.rejectionCount > 0 ? `<span class="badge rejection-badge">${Icons.rotateCcw(14)} ${task.rejectionCount}</span>` : ""}
          </div>
          <div class="task-footer">
            <span class="project-name">${this.escapeHtml(task.project)}</span>
            <div class="task-actions">
              ${canSendToAgent ? `<button class="agent-btn" onclick="event.stopPropagation(); showAgentModal('${task.id}')" title="Send to AI Agent">${Icons.play(16)}</button>` : ""}
            </div>
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

    select.action-btn {
      padding: 8px 28px 8px 12px;
      position: relative;
      cursor: pointer;
      outline: none;
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      min-width: 120px;
    }

    select.action-btn.secondary-btn {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    select.action-btn.secondary-btn::after {
      content: '';
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 12px;
      height: 12px;
      background-color: var(--vscode-button-secondaryForeground);
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 4L6 8L10 4' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      mask-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 4L6 8L10 4' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-size: contain;
      mask-size: contain;
      -webkit-mask-position: center;
      mask-position: center;
      pointer-events: none;
    }

    select.action-btn option {
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
    }

    .icon-btn {
      padding: 8px;
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
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
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      height: calc(100vh - 100px);
      position: relative;
    }

    .board.with-prd {
      margin-right: 40%;
      transition: margin-right 0.3s ease;
    }

    .column {
      background: var(--vscode-sideBar-background);
      border-radius: 8px;
      padding: 15px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-left: 4px solid transparent;
      transition: opacity 0.2s, transform 0.2s;
    }

    .column.hidden {
      display: none;
    }

    /* Settings dropdown */
    .settings-dropdown {
      position: relative;
      display: inline-block;
    }

    .settings-panel {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 6px;
      padding: 12px;
      min-width: 180px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: none;
    }

    .settings-panel.open {
      display: block;
    }

    .settings-panel h4 {
      margin: 0 0 10px 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .column-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      cursor: pointer;
      font-size: 13px;
    }

    .column-toggle:hover {
      color: var(--vscode-textLink-foreground);
    }

    .column-toggle input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
      accent-color: var(--vscode-button-background);
    }

    .settings-divider {
      height: 1px;
      background: var(--vscode-panel-border);
      margin: 10px 0;
    }

    .settings-link {
      display: block;
      padding: 6px 0;
      font-size: 13px;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-decoration: none;
    }

    .settings-link:hover {
      text-decoration: underline;
    }

    .column[data-status="Backlog"] {
      border-left-color: #6b7280;
      background: rgba(107, 114, 128, 0.05);
    }

    .column[data-status="To Do"] {
      border-left-color: #3b82f6;
      background: rgba(59, 130, 246, 0.05);
    }

    .column[data-status="Doing"] {
      border-left-color: #8b5cf6;
      background: rgba(139, 92, 246, 0.05);
    }

    .column[data-status="Testing"] {
      border-left-color: #f59e0b;
      background: rgba(245, 158, 11, 0.05);
    }

    .column[data-status="Done"] {
      border-left-color: #10b981;
      background: rgba(16, 185, 129, 0.05);
    }

    .column[data-status="Blocked"] {
      border-left-color: #ef4444;
      background: rgba(239, 68, 68, 0.05);
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
      cursor: grab;
      transition: all 0.2s;
      user-select: none;
      -webkit-user-select: none;
    }

    .task-card:active {
      cursor: grabbing;
    }

    .task-card:hover {
      background-color: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-list-activeSelectionBorder, var(--vscode-panel-border));
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


    .task-actions {
      display: flex;
      gap: 6px;
    }

    .agent-btn {
      background: rgba(99, 102, 241, 0.2);
      color: #6366f1;
      border: 1px solid #6366f1;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
    }

    .agent-btn:hover {
      background: #6366f1;
      color: white;
      color: white;
    }

    /* Agent status indicators */
    .task-card.agent-running {
      border-left: 3px solid #6366f1;
    }

    .task-card.agent-completed {
      border-left: 3px solid #22c55e;
    }

    .task-card.agent-error {
      border-left: 3px solid #ef4444;
    }

    .agent-running-badge {
      background: rgba(99, 102, 241, 0.2);
      color: #6366f1;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Play/Stop button on task cards */
    .play-stop-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 2px 8px;
      cursor: pointer;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.2s, background 0.2s;
      margin-left: 8px;
      flex-shrink: 0;
    }

    .task-card:hover .play-stop-btn,
    .play-stop-btn.running {
      opacity: 1;
    }

    .play-stop-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    /* Stop button - red when running */
    .play-stop-btn.running {
      background: #ef4444;
      color: white;
    }

    .play-stop-btn.running:hover {
      background: #dc2626;
    }

    /* Rate limit trigger button - shows next to stop button when running */
    .rate-limit-btn {
      display: none;
      background: #eab308;
      color: black;
      border: none;
      border-radius: 4px;
      width: 24px;
      height: 24px;
      cursor: pointer;
      font-size: 12px;
      margin-left: 4px;
    }

    .task-card.running .rate-limit-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .rate-limit-btn:hover {
      background: #ca8a04;
    }

    /* Running state for task cards - prominent visual */
    .task-card.running {
      background: linear-gradient(135deg,
        rgba(34, 197, 94, 0.15) 0%,
        rgba(34, 197, 94, 0.05) 100%);
      border-left: 4px solid #22c55e;
      box-shadow: 0 0 12px rgba(34, 197, 94, 0.3);
      position: relative;
      overflow: hidden;
    }

    /* Animated running indicator bar */
    .task-card.running::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, #22c55e, transparent);
      animation: running-bar 1.5s ease-in-out infinite;
    }

    @keyframes running-bar {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    /* Rate limit countdown state */
    .task-card.rate-limited {
      background: linear-gradient(135deg,
        rgba(234, 179, 8, 0.15) 0%,
        rgba(234, 179, 8, 0.05) 100%);
      border-left: 4px solid #eab308;
      box-shadow: 0 0 12px rgba(234, 179, 8, 0.3);
      position: relative;
    }

    .rate-limit-countdown {
      display: none;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      z-index: 10;
    }

    .task-card.rate-limited .rate-limit-countdown {
      display: flex;
    }

    .countdown-timer {
      font-size: 24px;
      font-weight: bold;
      color: #eab308;
      font-family: monospace;
    }

    .countdown-label {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 8px;
    }

    .countdown-actions {
      display: flex;
      gap: 8px;
    }

    .countdown-btn {
      padding: 4px 12px;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }

    .countdown-btn.retry-now {
      background: #22c55e;
      color: white;
    }

    .countdown-btn.retry-now:hover {
      background: #16a34a;
    }

    .countdown-btn.cancel {
      background: #ef4444;
      color: white;
    }

    .countdown-btn.cancel:hover {
      background: #dc2626;
    }

    /* Rate limit banner - fixed at top */
    .rate-limit-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(90deg, #eab308, #ca8a04);
      color: black;
      padding: 12px 20px;
      display: none;
      align-items: center;
      justify-content: space-between;
      z-index: 1000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }

    .rate-limit-banner.active {
      display: flex;
    }

    .rate-limit-banner-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .rate-limit-banner-timer {
      font-size: 24px;
      font-weight: bold;
      font-family: monospace;
    }

    .rate-limit-banner-task {
      font-size: 14px;
    }

    .rate-limit-banner-actions {
      display: flex;
      gap: 8px;
    }

    .rate-limit-banner-actions button {
      padding: 6px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
    }

    .rate-limit-banner-actions .retry-btn {
      background: #22c55e;
      color: white;
    }

    .rate-limit-banner-actions .cancel-btn {
      background: rgba(0,0,0,0.3);
      color: white;
    }

    /* Adjust body when banner is active */
    body.has-rate-limit-banner {
      padding-top: 60px;
    }

    /* PRD panel actions */
    .prd-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .play-prd-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 4px 12px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    }

    .play-prd-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    /* Provider badges */
    .provider-badge {
      font-size: 9px;
    }

    .provider-cursor {
      background: rgba(99, 102, 241, 0.2);
      color: #6366f1;
    }

    .provider-openai {
      background: rgba(16, 163, 127, 0.2);
      color: #10a37f;
    }

    .provider-openrouter {
      background: rgba(168, 85, 247, 0.2);
      color: #a855f7;
    }

    .provider-replicate {
      background: rgba(234, 179, 8, 0.2);
      color: #eab308;
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

    .modal-btn-send {
      background: #6366f1;
      color: white;
    }

    .modal-btn-send:hover {
      background: #4f46e5;
    }

    .modal-btn-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Agent Modal specific */
    .agent-modal {
      width: 500px;
    }

    .task-preview {
      background: var(--vscode-input-background);
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 15px;
    }

    .task-preview strong {
      display: block;
      margin-bottom: 4px;
    }

    .task-preview p {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin: 0;
    }

    .form-group {
      margin-bottom: 15px;
    }

    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
    }

    .form-group select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: 14px;
    }

    .form-group select:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .provider-options {
      background: var(--vscode-input-background);
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 15px;
    }

    .provider-options label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .provider-options input[type="checkbox"] {
      width: 16px;
      height: 16px;
    }

    .loading-spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid transparent;
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-left: 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .no-providers-warning {
      background: rgba(244, 67, 54, 0.1);
      border: 1px solid #f44336;
      color: #f44336;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 15px;
      font-size: 13px;
    }

    .no-providers-warning a {
      color: #f44336;
      text-decoration: underline;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    .empty-state-setup {
      text-align: center;
      padding: 60px 40px;
      color: var(--vscode-foreground);
      max-width: 600px;
      margin: 0 auto;
    }

    .empty-state-setup h3 {
      font-size: 18px;
      margin-bottom: 16px;
      color: var(--vscode-foreground);
    }

    .empty-state-setup p {
      margin-bottom: 12px;
      line-height: 1.6;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state-setup code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
    }

    .empty-state-setup ol {
      text-align: left;
      margin: 20px 0;
      padding-left: 30px;
    }

    .empty-state-setup li {
      margin-bottom: 12px;
      line-height: 1.6;
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
      position: fixed;
      top: 80px;
      right: 0;
      width: 40%;
      height: calc(100vh - 80px);
      background: var(--vscode-sideBar-background);
      border-left: 2px solid var(--vscode-panel-border);
      padding: 20px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
      z-index: 1000;
      overflow: hidden;
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out;
    }

    .prd-preview-panel[data-visible="true"] {
      transform: translateX(0);
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

    /* Column header with actions */
    .column-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Play All button */
    .play-all-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      cursor: pointer;
      transition: opacity 0.2s, background 0.2s;
    }

    .play-all-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .play-all-btn.running {
      background: #ef4444;
    }

    .play-all-btn.running:hover {
      background: #dc2626;
    }

    .play-all-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Batch progress banner */
    .batch-progress-banner {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--vscode-notifications-background);
      border: 1px solid var(--vscode-notifications-border);
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
    }

    .batch-progress-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .batch-progress-icon {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .batch-progress-stats {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .batch-cancel-btn {
      background: transparent;
      border: 1px solid var(--vscode-button-border, #444);
      color: var(--vscode-foreground);
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
    }

    .batch-cancel-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  </style>
</head>
<body>
    <div class="header">
      <div class="title">Kaiban Markdown</div>
      <div class="header-actions">
        <button class="action-btn secondary-btn icon-btn" onclick="createTask()" title="Create new task">
          ${Icons.plus(16)}
        </button>
        <select class="action-btn secondary-btn" id="sortSelect" onchange="onSortChange()" title="Sort tasks">
          <option value="default">Default</option>
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
      </div>
    </div>

  <div class="board" id="kanbanBoard">
    ${
      isEmpty
        ? `
    <div style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; padding: 40px;">
      <div class="empty-state-setup">
        <h3>Welcome to Kaiban Markdown!</h3>
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
          <li>Click <strong>Refresh</strong> to see your task appear!</li>
        </ol>
        <p style="margin-top: 24px; font-size: 13px; color: var(--vscode-descriptionForeground);">
          📖 See the README for detailed setup instructions and examples.
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

    <div class="prd-preview-panel" id="prdPanel" style="display: none; visibility: hidden;">
      <div class="prd-header">
        <span>PRD Preview</span>
        <div class="prd-actions">
          <button class="play-prd-btn" id="playPrdBtn" onclick="executePRD()" title="Execute via Claude CLI" style="display: none;">▶ Execute</button>
          <button class="close-prd-btn" onclick="closePRD()" title="Close PRD Panel">×</button>
        </div>
      </div>
      <div class="prd-content" id="prdContent">
        <div class="prd-placeholder">Select a task to view its PRD</div>
      </div>
    </div>
  </div>

  <!-- Agent Modal -->
  <div class="modal-overlay" id="agentModal" style="display: none;">
    <div class="modal agent-modal">
      <h3>Send Task to AI Agent</h3>

      <!-- Task Preview -->
      <div class="task-preview">
        <strong id="agentModalTaskTitle"></strong>
        <p id="agentModalTaskDescription"></p>
      </div>

      <!-- No Providers Warning -->
      <div class="no-providers-warning" id="noProvidersWarning" style="display: none;">
        No AI providers configured. Please configure at least one provider via
        <a href="#" onclick="configureProviders()">Kaiban: Configure AI Providers</a> command.
      </div>

      <!-- Execution Method Selection -->
      <div class="form-group">
        <label>Execution Method:</label>
        <div class="provider-options">
          <label>
            <input type="radio" name="executionMethod" value="ralph" id="ralphMethod" onchange="onExecutionMethodChange()">
            Execute with Ralph Loop (Terminal Command)
          </label>
          <label>
            <input type="radio" name="executionMethod" value="agent" id="agentMethod" checked onchange="onExecutionMethodChange()">
            Send to AI Agent
          </label>
        </div>
      </div>

      <!-- Ralph Loop Section -->
      <div class="form-group" id="ralphSection" style="display: none;">
        <p style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 0;">
          This will execute the ralph-loop command in your terminal with the task information.
        </p>
      </div>

      <!-- Provider Selection -->
      <div class="form-group" id="providerSelectGroup">
        <label for="providerSelect">Provider:</label>
        <select id="providerSelect" onchange="onProviderChange()">
          <option value="">Select a provider...</option>
        </select>
      </div>

      <!-- Model Selection -->
      <div class="form-group" id="modelSelectGroup" style="display: none;">
        <label for="modelSelect">Model:</label>
        <select id="modelSelect">
          <option value="">Loading models...</option>
        </select>
      </div>

      <!-- Cursor-specific options -->
      <div class="provider-options" id="cursorOptions" style="display: none;">
        <label>
          <input type="checkbox" id="createPR" checked>
          Auto-create Pull Request when complete
        </label>
      </div>

      <!-- Actions -->
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" onclick="hideAgentModal()">Cancel</button>
        <button class="modal-btn modal-btn-send" id="sendToAgentBtn" onclick="confirmSendToAgent()" disabled>
          Execute
        </button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
      let draggedElement = null;
      let isDragging = false;
      let currentSortMode = 'default'; // 'default', 'priority-asc', 'priority-desc'
      let originalTaskOrder = new Map(); // Store original order of tasks per column

    // Agent modal state
    let currentAgentTaskId = null;
    let availableProviders = [];
    let availableModels = [];

    // Claude execution state
    let currentPrdTaskId = null;
    let runningTasks = new Set();  // Track task IDs that are currently executing

    // Rate limit state
    let rateLimitTaskId = null;
    let rateLimitEndTime = null;
    let rateLimitInterval = null;

    // Rate limit functions
    function startRateLimitCountdown(taskId, waitSeconds) {
      rateLimitTaskId = taskId;
      rateLimitEndTime = Date.now() + (waitSeconds * 1000);

      // Get task name
      const card = document.querySelector(\`[data-task-id="\${taskId}"]\`);
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

      const timerStr = \`\${minutes.toString().padStart(2, '0')}:\${seconds.toString().padStart(2, '0')}\`;
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
        const card = document.querySelector(\`[data-task-id="\${rateLimitTaskId}"]\`);
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
        vscode.postMessage({
          command: 'stopClaudeExecution',
          taskId: taskId
        });
      } else {
        // Start the execution
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
      const card = document.querySelector(\`[data-task-id="\${taskId}"]\`);
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
      const card = document.querySelector(\`[data-task-id="\${taskId}"]\`);
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
          // If no PRD, show panel with placeholder
          if (board && panel && prdContent) {
            board.classList.add('with-prd');
            panel.style.display = 'flex';
            panel.style.visibility = 'visible';
            requestAnimationFrame(() => {
              panel.setAttribute('data-visible', 'true');
            });
            prdContent.innerHTML = '<div class="prd-placeholder">This task has no PRD linked</div>';
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

      if (!board || !panel) return;

      // Add with-prd class to board
      board.classList.add('with-prd');

      // Show PRD panel with animation
      panel.style.display = 'flex';
      panel.style.visibility = 'visible';
      // Use requestAnimationFrame to ensure display is applied before setting data attribute
      requestAnimationFrame(() => {
        panel.setAttribute('data-visible', 'true');
      });

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

      if (!board || !panel) return;

      // Remove with-prd class from board
      board.classList.remove('with-prd');

      // Hide PRD panel with animation
      panel.setAttribute('data-visible', 'false');
      // Wait for animation to complete before hiding
      setTimeout(() => {
        panel.style.display = 'none';
        panel.style.visibility = 'hidden';
      }, 300);

      // Clear selection
      document.querySelectorAll('.task-card').forEach(c => c.classList.remove('selected'));

      // Reset content
      if (content) {
        content.innerHTML = '<div class="prd-placeholder">Select a task to view its PRD</div>';
      }
    }

    // Refresh handler
    function refresh() {
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
        playAllBtn.innerHTML = isRunning ? '⏹ Stop All' : '${Icons.play(12)} Play All';
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

    // Open settings handler
    function openSettings() {
      closeSettingsPanel();
      vscode.postMessage({ command: 'openSettings' });
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
      const column = document.querySelector(\`.column[data-status="\${columnName}"]\`);
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

          if (panel && content) {
            // Ensure panel is visible when content is updated
            panel.style.display = 'flex';
            panel.style.visibility = 'visible';
            if (board) {
              board.classList.add('with-prd');
            }
            requestAnimationFrame(() => {
              panel.setAttribute('data-visible', 'true');
            });
            content.innerHTML = \`<div class="prd-markdown">\${message.content}</div>\`;
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
                \`<option value="\${p.type}">\${p.name}\${p.enabled ? '' : ' (not configured)'}</option>\`
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
              \`<option value="\${m.id}">\${m.name} ($\${m.inputPrice}/M in, $\${m.outputPrice}/M out)</option>\`
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
          const card = document.querySelector(\`[data-task-id="\${message.taskId}"]\`);
          if (card) {
            // Remove old status classes
            card.classList.remove('agent-pending', 'agent-running', 'agent-completed', 'agent-error');
            // Add new status class
            card.classList.add(\`agent-\${message.status}\`);
          }
          break;
        }

        case 'ralphCommandExecuted': {
          hideAgentModal();
          // Command executed successfully, modal already closed
          break;
        }

        case 'ralphCommandError': {
          const btn = document.getElementById('sendToAgentBtn');
          btn.disabled = false;
          btn.textContent = 'Execute with Ralph';
          alert('Error: ' + (message.error || 'Failed to execute ralph command'));
          break;
        }

        case 'claudeExecutionStarted': {
          runningTasks.add(message.taskId);
          updateTaskRunningState(message.taskId, true);
          break;
        }

        case 'claudeExecutionStopped': {
          runningTasks.delete(message.taskId);
          updateTaskRunningState(message.taskId, false);
          break;
        }

        case 'claudeExecutionError': {
          runningTasks.delete(message.taskId);
          updateTaskRunningState(message.taskId, false);
          alert('Claude execution failed: ' + (message.error || 'Unknown error'));
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
          break;
        }

        case 'batchTaskStarted': {
          // Highlight the current task being executed
          const card = document.querySelector(\`[data-task-id="\${message.taskId}"]\`);
          if (card) {
            card.classList.add('running');
          }
          updateBatchProgress(message.index + 1, message.total, batchProgress.completed, batchProgress.skipped);
          break;
        }

        case 'batchTaskCompleted': {
          // Remove running state from task
          const taskCard = document.querySelector(\`[data-task-id="\${message.taskId}"]\`);
          if (taskCard) {
            taskCard.classList.remove('running');
          }

          if (message.success) {
            batchProgress.completed++;
          } else {
            batchProgress.skipped++;
          }
          updateBatchProgress(batchProgress.current, batchProgress.total, batchProgress.completed, batchProgress.skipped);
          break;
        }

        case 'batchExecutionProgress': {
          updateBatchProgress(message.current, message.total, message.completed, message.skipped);
          break;
        }

        case 'batchExecutionComplete': {
          updateBatchUI(false);
          alert(\`Batch complete!\\n\\nCompleted: \${message.completed}\\nSkipped: \${message.skipped}\`);
          refresh(); // Refresh to update task positions
          break;
        }

        case 'batchExecutionCancelled': {
          updateBatchUI(false);
          alert(\`Batch cancelled.\\n\\nCompleted: \${message.completed}\\nRemaining: \${message.total - message.current}\`);
          refresh();
          break;
        }
        // ============ End Batch Execution Message Handlers ============
      }
    });
  </script>

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
