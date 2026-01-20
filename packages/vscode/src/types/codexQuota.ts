/**
 * Codex CLI usage quota types
 * Based on the ChatGPT API at https://chatgpt.com/backend-api/wham/usage
 */

/**
 * Structure of ~/.codex/auth.json (created by `codex login`)
 */
export interface CodexAuthFile {
  tokens?: CodexTokens;
}

export interface CodexTokens {
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
  expiresAt?: number;
}

/**
 * Rate limit window from API response
 */
export interface LimitWindow {
  /** Percentage of limit used (0-100+) */
  used_percent: number;
  /** Unix timestamp when window resets */
  reset_at: number;
  /** Window duration in seconds */
  limit_window_seconds: number;
}

/**
 * Codex usage API response from ChatGPT backend
 */
export interface CodexUsageResponse {
  plan_type: string;
  rate_limit: {
    allowed: boolean;
    limit_reached: boolean;
    primary_window: LimitWindow | null;
    secondary_window: LimitWindow | null;
  } | null;
  code_review_rate_limit: {
    allowed: boolean;
    limit_reached: boolean;
    primary_window: LimitWindow | null;
  } | null;
  credits: {
    has_credits: boolean;
    unlimited: boolean;
    balance: number;
  } | null;
}

/**
 * Internal usage model
 */
export interface UsageWindow {
  /** Percentage utilization (0-100+, can exceed 100 when over limit) */
  utilization: number;
  /** When this window resets */
  resetsAt: Date;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface CodexUsage {
  /** 5-hour session limit (primary_window from rate_limit) */
  sessionLimit: UsageWindow | null;
  /** 7-day weekly limit (secondary_window from rate_limit) */
  weeklyLimit: UsageWindow | null;
  /** Code review limit */
  codeReviewLimit: UsageWindow | null;
  /** Plan type (e.g., "plus", "free") */
  planType: string;
  /** When the data was fetched */
  lastUpdated: Date;
}

export type QuotaStatus = "good" | "warning" | "critical";

export interface CodexQuotaDisplayData {
  usage: CodexUsage | null;
  error: string | null;
  isLoading: boolean;
  isAvailable: boolean;
}

/**
 * Get the status color based on utilization percentage (0-100+)
 */
export function getCodexQuotaStatus(utilization: number): QuotaStatus {
  if (utilization >= 90) return "critical";
  if (utilization >= 80) return "warning";
  return "good";
}

/**
 * Format remaining time until reset
 */
export function formatCodexResetTime(resetsAt: Date): string {
  const now = new Date();
  const diff = resetsAt.getTime() - now.getTime();

  if (diff <= 0) return "resetting...";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}
