/**
 * Task execution utility for CLI
 */

import { spawn } from "node:child_process";
import type { Task } from "@kaibanboard/core";
import { CoreTaskParser } from "@kaibanboard/core";
import { CLIDetectionService } from "../services/cliDetectionService.js";
import type { CLIProviderName } from "../types/cli.js";
import { DEFAULT_CLI_CONFIGS } from "../types/cli.js";

export interface ExecutionResult {
  success: boolean;
  error?: string;
}

/**
 * Execute a task using the detected CLI
 */
export async function executeTask(
  task: Task,
  workspaceDir: string,
  cliProvider?: CLIProviderName
): Promise<ExecutionResult> {
  const cliService = new CLIDetectionService();

  // Get available CLI
  const status = await cliService.getCLIAvailabilityStatus(cliProvider || "auto");

  if (!status.hasAvailableCLI || !status.selectedProvider) {
    return {
      success: false,
      error: "No CLI available. Install Claude CLI, Codex CLI, or Cursor CLI.",
    };
  }

  const cliConfig = DEFAULT_CLI_CONFIGS[status.selectedProvider];
  const prompt = cliConfig.promptTemplate.replace("{taskFile}", task.filePath);

  // Update task status to In Progress
  const parser = new CoreTaskParser([{ path: workspaceDir, name: "workspace" }]);
  parser.updateTaskStatus(task.id, "In Progress");

  // Build command
  const args = [prompt];
  if (cliConfig.additionalFlags) {
    args.push(...cliConfig.additionalFlags.split(" ").filter(Boolean));
  }

  return new Promise((resolve) => {
    const proc = spawn(cliConfig.executablePath, args, {
      cwd: workspaceDir,
      stdio: "inherit",
      shell: true,
    });

    proc.on("error", (error) => {
      resolve({
        success: false,
        error: error.message,
      });
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: `CLI exited with code ${code}`,
        });
      }
    });
  });
}

/**
 * Get CLI availability status
 */
export async function getCLIStatus(): Promise<{
  available: boolean;
  provider: CLIProviderName | null;
  version?: string;
}> {
  const cliService = new CLIDetectionService();
  const status = await cliService.getCLIAvailabilityStatus("auto");

  let version: string | undefined;
  if (status.selectedProvider) {
    const result = await cliService.detectCLI(status.selectedProvider);
    version = result.version;
  }

  return {
    available: status.hasAvailableCLI,
    provider: status.selectedProvider,
    version,
  };
}
