/**
 * CLI provider types for multi-CLI support
 * Supports Claude CLI, Codex CLI, and Cursor CLI
 */

/** Supported CLI provider names */
export type CLIProviderName = "claude" | "codex" | "cursor";

/** CLI provider selection mode */
export type CLISelectionMode = CLIProviderName | "auto";

/** CLI detection status */
export interface CLIDetectionResult {
  /** Name of the CLI */
  name: CLIProviderName;
  /** Whether the CLI is available on the system */
  available: boolean;
  /** Path to the executable (resolved) */
  executablePath: string;
  /** Version string if detected */
  version?: string;
  /** Error message if detection failed */
  error?: string;
}

/** Configuration for a specific CLI provider */
export interface CLIProviderConfig {
  /** Name of the CLI */
  name: CLIProviderName;
  /** Path to the executable */
  executablePath: string;
  /** Prompt template with {taskFile} placeholder */
  promptTemplate: string;
  /** Additional command-line flags */
  additionalFlags: string;
  /** Whether this CLI supports the ralph-loop plugin */
  supportsRalphLoop: boolean;
}

/** CLI availability status for UI display */
export interface CLIAvailabilityStatus {
  /** All detected CLIs and their status */
  clis: CLIDetectionResult[];
  /** Currently selected CLI provider */
  selectedProvider: CLIProviderName | null;
  /** Selection mode (auto or specific provider) */
  selectionMode: CLISelectionMode;
  /** Whether any CLI is available */
  hasAvailableCLI: boolean;
  /** Error message if no CLI is available */
  error?: string;
}

/** Default CLI configurations */
export const DEFAULT_CLI_CONFIGS: Record<CLIProviderName, Omit<CLIProviderConfig, "name">> = {
  claude: {
    executablePath: "claude",
    promptTemplate:
      "Read the task file at {taskFile} and implement it. The task contains a link to the PRD with full requirements. Update the task status to Done when complete.",
    additionalFlags: "",
    supportsRalphLoop: true,
  },
  codex: {
    executablePath: "codex",
    promptTemplate:
      "Read the task file at {taskFile} and implement it. The task contains a link to the PRD with full requirements. Update the task status to Done when complete.",
    additionalFlags: "",
    supportsRalphLoop: false,
  },
  cursor: {
    executablePath: "cursor",
    promptTemplate:
      "Read the task file at {taskFile} and implement it. The task contains a link to the PRD with full requirements. Update the task status to Done when complete.",
    additionalFlags: "",
    supportsRalphLoop: false,
  },
};

/** Order of CLI preference for auto-detection */
export const CLI_PREFERENCE_ORDER: CLIProviderName[] = ["claude", "codex", "cursor"];

/**
 * Get display name for CLI provider
 */
export function getCLIDisplayName(name: CLIProviderName): string {
  const displayNames: Record<CLIProviderName, string> = {
    claude: "Claude CLI",
    codex: "Codex CLI",
    cursor: "Cursor CLI",
  };
  return displayNames[name];
}

/**
 * Get installation instructions for a CLI
 */
export function getCLIInstallInstructions(name: CLIProviderName): string {
  const instructions: Record<CLIProviderName, string> = {
    claude: "Install Claude CLI: npm install -g @anthropic-ai/claude-cli",
    codex: "Install Codex CLI: npm install -g @openai/codex",
    cursor: "Cursor CLI is included with Cursor IDE",
  };
  return instructions[name];
}
