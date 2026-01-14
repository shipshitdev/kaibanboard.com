import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  CLIAvailabilityStatus,
  CLIDetectionResult,
  CLIProviderConfig,
  CLIProviderName,
  CLISelectionMode,
} from "../types/cli";
import { CLI_PREFERENCE_ORDER, DEFAULT_CLI_CONFIGS } from "../types/cli";

const execAsync = promisify(exec);

/** Cache timeout in milliseconds (5 minutes) */
const CACHE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Service for detecting and managing CLI providers.
 * Supports Claude CLI, Codex CLI, and Cursor CLI.
 */
export class CLIDetectionService {
  private cachedResults: Map<CLIProviderName, CLIDetectionResult> = new Map();
  private cacheTimestamp: number = 0;

  /**
   * Check if a specific CLI is available on the system.
   * Uses `which` on Unix or `where` on Windows to detect the executable.
   * For Cursor, also checks shell function availability.
   */
  async detectCLI(cliName: CLIProviderName, executablePath?: string): Promise<CLIDetectionResult> {
    const path = executablePath || DEFAULT_CLI_CONFIGS[cliName].executablePath;

    const result: CLIDetectionResult = {
      name: cliName,
      available: false,
      executablePath: path,
    };

    try {
      // Try using 'which' (Unix) or 'where' (Windows) to find the executable
      const whichCommand = process.platform === "win32" ? "where" : "which";

      try {
        const { stdout } = await execAsync(`${whichCommand} ${path}`, {
          timeout: 5000,
        });
        const resolvedPath = stdout.trim().split("\n")[0];
        if (resolvedPath) {
          result.available = true;
          result.executablePath = resolvedPath;
        }
      } catch {
        // 'which' failed - CLI not found in PATH
        // For cursor, try additional detection methods
        if (cliName === "cursor") {
          const cursorAvailable = await this.detectCursorCLI(path);
          if (cursorAvailable) {
            result.available = true;
          }
        }
      }

      // Try to get version if CLI is available
      if (result.available) {
        try {
          const versionFlag = cliName === "cursor" ? "--version" : "--version";
          const { stdout } = await execAsync(`${path} ${versionFlag}`, {
            timeout: 5000,
          });
          const versionMatch = stdout.match(/\d+\.\d+(\.\d+)?/);
          if (versionMatch) {
            result.version = versionMatch[0];
          }
        } catch {
          // Version detection failed - not critical
        }
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  /**
   * Special detection for Cursor CLI which may be a shell function
   * or installed in a non-standard location.
   */
  private async detectCursorCLI(path: string): Promise<boolean> {
    try {
      // Try common Cursor installation paths on macOS
      if (process.platform === "darwin") {
        const macPaths = [
          "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
          `${process.env.HOME}/Applications/Cursor.app/Contents/Resources/app/bin/cursor`,
        ];

        for (const macPath of macPaths) {
          try {
            await execAsync(`test -x "${macPath}"`, { timeout: 2000 });
            return true;
          } catch {
            // Path doesn't exist or isn't executable
          }
        }
      }

      // Try running the command directly (may be a shell function)
      await execAsync(`${path} --version`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect all supported CLIs and return their availability status.
   * Results are cached for performance.
   */
  async detectAllCLIs(forceRefresh = false): Promise<CLIDetectionResult[]> {
    const now = Date.now();

    // Return cached results if still valid
    if (
      !forceRefresh &&
      this.cachedResults.size > 0 &&
      now - this.cacheTimestamp < CACHE_TIMEOUT_MS
    ) {
      return Array.from(this.cachedResults.values());
    }

    // Detect all CLIs in parallel
    const detectionPromises = CLI_PREFERENCE_ORDER.map((cli) => this.detectCLI(cli));
    const results = await Promise.all(detectionPromises);

    // Update cache
    this.cachedResults.clear();
    for (const result of results) {
      this.cachedResults.set(result.name, result);
    }
    this.cacheTimestamp = now;

    return results;
  }

  /**
   * Get the CLI availability status including selected provider.
   */
  async getCLIAvailabilityStatus(
    selectionMode: CLISelectionMode = "auto"
  ): Promise<CLIAvailabilityStatus> {
    const clis = await this.detectAllCLIs();
    const availableCLIs = clis.filter((cli) => cli.available);
    const hasAvailableCLI = availableCLIs.length > 0;

    let selectedProvider: CLIProviderName | null = null;

    if (hasAvailableCLI) {
      if (selectionMode === "auto") {
        // Select the first available CLI based on preference order
        for (const preferredCLI of CLI_PREFERENCE_ORDER) {
          const cli = availableCLIs.find((c) => c.name === preferredCLI);
          if (cli) {
            selectedProvider = cli.name;
            break;
          }
        }
      } else {
        // Use the specified CLI if available
        const specifiedCLI = availableCLIs.find((c) => c.name === selectionMode);
        if (specifiedCLI) {
          selectedProvider = specifiedCLI.name;
        } else {
          // Fallback to auto if specified CLI is not available
          for (const preferredCLI of CLI_PREFERENCE_ORDER) {
            const cli = availableCLIs.find((c) => c.name === preferredCLI);
            if (cli) {
              selectedProvider = cli.name;
              break;
            }
          }
        }
      }
    }

    return {
      clis,
      selectedProvider,
      selectionMode,
      hasAvailableCLI,
      error: hasAvailableCLI
        ? undefined
        : "No CLI available. Install Claude CLI, Codex CLI, or Cursor CLI.",
    };
  }

  /**
   * Get configuration for a specific CLI provider from VS Code settings.
   */
  getCLIConfig(
    cliName: CLIProviderName,
    vscodeConfig: {
      get: <T>(key: string, defaultValue: T) => T;
    }
  ): CLIProviderConfig {
    const defaults = DEFAULT_CLI_CONFIGS[cliName];

    return {
      name: cliName,
      executablePath: vscodeConfig.get<string>(
        `${cliName}.executablePath`,
        defaults.executablePath
      ),
      promptTemplate: vscodeConfig.get<string>(
        `${cliName}.promptTemplate`,
        defaults.promptTemplate
      ),
      additionalFlags: vscodeConfig.get<string>(
        `${cliName}.additionalFlags`,
        defaults.additionalFlags
      ),
      supportsRalphLoop: defaults.supportsRalphLoop,
    };
  }

  /**
   * Clear the detection cache.
   */
  clearCache(): void {
    this.cachedResults.clear();
    this.cacheTimestamp = 0;
  }

  /**
   * Get cached detection result for a specific CLI.
   */
  getCachedResult(cliName: CLIProviderName): CLIDetectionResult | undefined {
    return this.cachedResults.get(cliName);
  }
}
