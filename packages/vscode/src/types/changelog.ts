/**
 * Changelog types for generating release notes from completed tasks
 */

/** Entry type mapping for Keep a Changelog format */
export type ChangelogType = "Added" | "Changed" | "Fixed" | "Breaking Changes" | "Other";

/** Single changelog entry derived from a completed task */
export interface ChangelogEntry {
  /** Task ID */
  taskId: string;
  /** Task title/label */
  title: string;
  /** Changelog category based on task type */
  type: ChangelogType;
  /** ISO date when task was completed */
  completedAt: string;
  /** Optional task description */
  description?: string;
  /** Link to PRD if available */
  prdPath?: string;
}

/** Options for changelog generation */
export interface ChangelogOptions {
  /** Starting point: git tag (v1.0.0) or date (YYYY-MM-DD) */
  since?: string;
  /** Output format */
  format: ChangelogFormat;
  /** Output file path (relative to workspace) */
  outputPath?: string;
  /** Preview only, don't write file */
  dryRun?: boolean;
  /** Version string for the changelog header */
  version?: string;
}

/** Supported output formats */
export type ChangelogFormat = "markdown" | "keepachangelog" | "json";

/** Result of changelog generation */
export interface ChangelogResult {
  /** Whether generation was successful */
  success: boolean;
  /** Generated changelog content */
  content?: string;
  /** Number of entries included */
  entryCount: number;
  /** Path where changelog was written (if not dry run) */
  outputPath?: string;
  /** Error message if failed */
  error?: string;
}

/** Task type to changelog type mapping */
export const TASK_TYPE_TO_CHANGELOG: Record<string, ChangelogType> = {
  Feature: "Added",
  Enhancement: "Changed",
  Refactor: "Changed",
  Bug: "Fixed",
  Research: "Other",
};

/** Default options for changelog generation */
export const DEFAULT_CHANGELOG_OPTIONS: Partial<ChangelogOptions> = {
  format: "keepachangelog",
  outputPath: "CHANGELOG.md",
  dryRun: false,
};
