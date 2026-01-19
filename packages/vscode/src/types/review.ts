/**
 * Codex Review types
 * For reviewing completed task changes with Codex CLI
 */

/** Review finding from Codex */
export interface ReviewFinding {
  /** Type of finding */
  type: ReviewFindingType;
  /** Severity level */
  severity: ReviewSeverity;
  /** File path where issue was found */
  filePath: string;
  /** Line number (if applicable) */
  lineNumber?: number;
  /** Description of the finding */
  description: string;
  /** Suggested fix or improvement */
  suggestion?: string;
  /** Code snippet related to the finding */
  codeSnippet?: string;
}

/** Types of review findings */
export type ReviewFindingType =
  | "bug" // Potential bug or logic error
  | "security" // Security vulnerability
  | "performance" // Performance issue
  | "style" // Code style issue
  | "maintainability" // Code maintainability concern
  | "best_practice" // Best practice violation
  | "documentation" // Missing or incorrect documentation
  | "test_coverage" // Missing test coverage
  | "other"; // Other findings

/** Severity levels for findings */
export type ReviewSeverity =
  | "critical" // Must fix before merge
  | "high" // Should fix before merge
  | "medium" // Consider fixing
  | "low" // Nice to have
  | "info"; // Informational only

/** Overall review rating */
export type ReviewRating =
  | "pass" // No critical issues, safe to merge
  | "needs_work" // Issues that should be addressed
  | "critical_issues"; // Critical issues that must be fixed

/** Codex review result */
export interface CodexReviewResult {
  /** Summary of the review */
  summary: string;
  /** Overall rating */
  overallRating: ReviewRating;
  /** Detailed findings */
  findings: ReviewFinding[];
  /** Suggested actions */
  suggestedActions: string[];
  /** Files reviewed */
  filesReviewed: string[];
  /** Total lines of code reviewed */
  linesReviewed: number;
  /** Review duration in seconds */
  reviewDuration: number;
  /** Timestamp of review */
  reviewedAt: string;
}

/** Review state for a task */
export interface ReviewState {
  /** Task ID */
  taskId: string;
  /** Current status */
  status: ReviewStatus;
  /** Review result (if completed) */
  result?: CodexReviewResult;
  /** Error message (if failed) */
  error?: string;
  /** Started at timestamp */
  startedAt?: string;
  /** Completed at timestamp */
  completedAt?: string;
}

/** Review operation status */
export type ReviewStatus =
  | "pending" // Review not started
  | "in_progress" // Review in progress
  | "completed" // Review completed
  | "failed"; // Review failed

/** Options for starting a review */
export interface ReviewOptions {
  /** Whether to use Codex (true) or Claude (false) */
  useCodex: boolean;
  /** Whether to review against the base branch */
  compareToBase: boolean;
  /** Focus areas for the review */
  focusAreas?: ReviewFindingType[];
  /** Custom review prompt */
  customPrompt?: string;
  /** Whether to include test suggestions */
  includeTestSuggestions: boolean;
}

/** Default review options */
export const DEFAULT_REVIEW_OPTIONS: ReviewOptions = {
  useCodex: true,
  compareToBase: true,
  focusAreas: ["bug", "security", "performance"],
  includeTestSuggestions: true,
};

/** Review prompt context */
export interface ReviewPromptContext {
  /** Task information */
  taskLabel: string;
  taskDescription: string;
  /** PRD content (if available) */
  prdContent?: string;
  /** Diff to review */
  diff: string;
  /** Files changed */
  filesChanged: string[];
  /** Focus areas */
  focusAreas: ReviewFindingType[];
}

/** Review panel actions */
export type ReviewPanelAction =
  | "apply_suggestion" // Apply a specific suggestion
  | "dismiss_finding" // Dismiss a finding
  | "request_fix" // Request AI to fix an issue
  | "close_panel"; // Close the review panel

/** Review action request */
export interface ReviewActionRequest {
  /** Action type */
  action: ReviewPanelAction;
  /** Task ID */
  taskId: string;
  /** Finding index (for finding-specific actions) */
  findingIndex?: number;
}

/** Codex CLI status for review */
export interface CodexReviewStatus {
  /** Whether Codex CLI is available */
  available: boolean;
  /** Codex CLI version */
  version?: string;
  /** Error message if not available */
  error?: string;
  /** Fallback message (if falling back to Claude) */
  fallbackMessage?: string;
}
