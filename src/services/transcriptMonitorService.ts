import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  ClaudeStepInfo,
  ClaudeStepProgress,
  ClaudeTranscriptEntry,
  MessageContent,
  ToolUseContent,
} from "../types/claudeTranscript";
import { getToolDisplayName, getToolInputSummary } from "../types/claudeTranscript";

/** Configuration for transcript monitoring */
interface TranscriptMonitorConfig {
  /** Polling interval in ms */
  pollIntervalMs: number;
  /** Max time to wait for session file to appear */
  sessionDiscoveryTimeoutMs: number;
  /** Max steps to keep in history */
  maxRecentSteps: number;
}

const DEFAULT_CONFIG: TranscriptMonitorConfig = {
  pollIntervalMs: 500,
  sessionDiscoveryTimeoutMs: 10000,
  maxRecentSteps: 10,
};

/** Callback for progress updates */
type ProgressCallback = (progress: ClaudeStepProgress) => void;

/** Active monitor state */
interface MonitorState {
  taskId: string;
  sessionFile: string | null;
  lastReadPosition: number;
  pollInterval: NodeJS.Timeout | null;
  recentSteps: ClaudeStepInfo[];
  currentStep: ClaudeStepInfo | null;
  sessionId: string | null;
  callback: ProgressCallback;
  startTime: Date;
}

/**
 * Service for monitoring Claude CLI JSONL transcript files.
 * Provides real-time progress updates for running tasks.
 */
export class TranscriptMonitorService {
  private monitors: Map<string, MonitorState> = new Map();
  private config: TranscriptMonitorConfig;

  constructor(config?: Partial<TranscriptMonitorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start monitoring for a task.
   * Discovers the JSONL file and starts polling for updates.
   */
  async startMonitoring(
    taskId: string,
    workspacePath: string,
    callback: ProgressCallback
  ): Promise<void> {
    // Stop existing monitor if any
    this.stopMonitoring(taskId);

    const state: MonitorState = {
      taskId,
      sessionFile: null,
      lastReadPosition: 0,
      pollInterval: null,
      recentSteps: [],
      currentStep: null,
      sessionId: null,
      callback,
      startTime: new Date(),
    };

    this.monitors.set(taskId, state);

    // Try to discover the session file
    const projectDir = this.getProjectDirectory(workspacePath);
    if (!projectDir) {
      console.warn(
        `[TranscriptMonitor] Could not determine project directory for ${workspacePath}`
      );
      return;
    }

    // Wait for session file to appear
    const sessionFile = await this.waitForSessionFile(projectDir, state.startTime);
    if (!sessionFile) {
      console.warn(`[TranscriptMonitor] No session file found for task ${taskId}`);
      return;
    }

    state.sessionFile = sessionFile;

    // Start polling
    state.pollInterval = setInterval(() => {
      this.pollForUpdates(taskId);
    }, this.config.pollIntervalMs);

    // Initial poll
    this.pollForUpdates(taskId);
  }

  /**
   * Stop monitoring a task.
   */
  stopMonitoring(taskId: string): void {
    const state = this.monitors.get(taskId);
    if (!state) return;

    if (state.pollInterval) {
      clearInterval(state.pollInterval);
    }

    this.monitors.delete(taskId);
  }

  /**
   * Stop all monitors.
   */
  dispose(): void {
    for (const taskId of this.monitors.keys()) {
      this.stopMonitoring(taskId);
    }
  }

  /**
   * Get Claude projects directory path.
   * Projects are stored at ~/.claude/projects/[project-hash]/
   */
  private getProjectDirectory(workspacePath: string): string | null {
    try {
      // Convert workspace path to project hash
      // /Users/foo/bar → -Users-foo-bar
      const projectHash = workspacePath.replace(/\//g, "-");
      const claudeDir = path.join(os.homedir(), ".claude", "projects", projectHash);

      return claudeDir;
    } catch {
      return null;
    }
  }

  /**
   * Wait for a new session JSONL file to appear.
   */
  private async waitForSessionFile(
    projectDir: string,
    startTime: Date,
    maxWaitMs = this.config.sessionDiscoveryTimeoutMs
  ): Promise<string | null> {
    const startWait = Date.now();

    while (Date.now() - startWait < maxWaitMs) {
      try {
        // Check if directory exists
        if (!fs.existsSync(projectDir)) {
          await this.sleep(200);
          continue;
        }

        const files = fs.readdirSync(projectDir);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

        // Find file modified after task start
        for (const file of jsonlFiles) {
          const filePath = path.join(projectDir, file);
          const stats = fs.statSync(filePath);

          // File modified within 2 seconds of task start
          if (stats.mtimeMs > startTime.getTime() - 2000) {
            // Validate by reading first entry
            const isValid = await this.validateSessionFile(filePath);
            if (isValid) {
              return filePath;
            }
          }
        }
      } catch {
        // Directory or files might not exist yet
      }

      await this.sleep(200);
    }

    return null;
  }

  /**
   * Validate a session file by checking it has valid JSONL entries.
   */
  private async validateSessionFile(filePath: string): Promise<boolean> {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      if (lines.length === 0) return false;

      // Try to parse first line
      const firstEntry = JSON.parse(lines[0]) as ClaudeTranscriptEntry;
      return !!firstEntry.sessionId;
    } catch {
      return false;
    }
  }

  /**
   * Poll for updates in the session file.
   */
  private pollForUpdates(taskId: string): void {
    const state = this.monitors.get(taskId);
    if (!state || !state.sessionFile) return;

    try {
      const stats = fs.statSync(state.sessionFile);

      // No new content
      if (stats.size <= state.lastReadPosition) {
        return;
      }

      // Read new content
      const fd = fs.openSync(state.sessionFile, "r");
      const newSize = stats.size - state.lastReadPosition;
      const buffer = Buffer.alloc(newSize);

      fs.readSync(fd, buffer, 0, newSize, state.lastReadPosition);
      fs.closeSync(fd);

      state.lastReadPosition = stats.size;

      // Parse new lines
      const content = buffer.toString("utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as ClaudeTranscriptEntry;
          this.processEntry(state, entry);
        } catch {
          // Skip malformed lines
        }
      }

      // Send progress update
      this.sendProgressUpdate(state);
    } catch (error) {
      // File might have been deleted or is inaccessible
      console.warn(`[TranscriptMonitor] Error polling ${taskId}:`, error);
    }
  }

  /**
   * Process a transcript entry and extract step info.
   */
  private processEntry(state: MonitorState, entry: ClaudeTranscriptEntry): void {
    if (!state.sessionId) {
      state.sessionId = entry.sessionId;
    }

    // Only process assistant messages for tool_use
    if (entry.type !== "assistant") return;

    const message = entry.message;
    if (!message?.content || typeof message.content === "string") return;

    // Look for tool_use blocks in content
    for (const block of message.content as MessageContent[]) {
      if (block.type === "tool_use") {
        const toolBlock = block as ToolUseContent;
        const step: ClaudeStepInfo = {
          id: toolBlock.id,
          type: "tool_use",
          timestamp: new Date(entry.timestamp),
          toolName: toolBlock.name,
          toolInput: toolBlock.input as Record<string, unknown>,
        };

        // Update current step
        state.currentStep = step;

        // Add to recent steps (keep limited history)
        state.recentSteps.push(step);
        if (state.recentSteps.length > this.config.maxRecentSteps) {
          state.recentSteps.shift();
        }
      } else if (block.type === "text") {
        // Could track thinking steps here if desired
      }
    }
  }

  /**
   * Send progress update to callback.
   */
  private sendProgressUpdate(state: MonitorState): void {
    const progress: ClaudeStepProgress = {
      sessionId: state.sessionId || "",
      taskId: state.taskId,
      currentStep: state.currentStep,
      recentSteps: [...state.recentSteps],
      status: state.currentStep ? "tool_use" : "thinking",
      lastUpdated: new Date(),
    };

    state.callback(progress);
  }

  /**
   * Get display text for current progress.
   */
  static getProgressDisplayText(progress: ClaudeStepProgress | null): {
    toolName: string;
    status: string;
  } {
    if (!progress || !progress.currentStep) {
      return { toolName: "", status: "Thinking..." };
    }

    const step = progress.currentStep;
    if (step.type === "tool_use" && step.toolName) {
      const toolName = getToolDisplayName(step.toolName);
      const inputSummary = step.toolInput ? getToolInputSummary(step.toolName, step.toolInput) : "";

      return {
        toolName: step.toolName,
        status: inputSummary ? `${toolName}: ${inputSummary}` : toolName,
      };
    }

    return { toolName: "", status: "Working..." };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
