/**
 * Claude Code usage quota types
 * Based on the API at https://api.anthropic.com/api/oauth/usage
 */

export interface UsageWindow {
  /** Percentage utilization (0 - 100+, can exceed 100 when over limit) */
  utilization: number;
  /** When this window resets */
  resetsAt: Date;
}

export interface ClaudeCodeUsage {
  /** 5-hour rolling session limit */
  fiveHour: UsageWindow;
  /** 7-day rolling weekly limit */
  sevenDay: UsageWindow;
  /** 7-day Sonnet-specific limit (optional) */
  sevenDaySonnet?: UsageWindow;
  /** When the data was fetched */
  lastUpdated: Date;
}

export interface ClaudeCodeUsageResponse {
  five_hour: {
    utilization: number;
    resets_at: string;
  };
  seven_day: {
    utilization: number;
    resets_at: string;
  };
  seven_day_sonnet?: {
    utilization: number;
    resets_at: string;
  } | null;
}

export interface ClaudeCodeCredentials {
  claudeAiOauth: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
}

export type QuotaStatus = "good" | "warning" | "critical";

export interface QuotaDisplayData {
  usage: ClaudeCodeUsage | null;
  error: string | null;
  isLoading: boolean;
  isMacOS: boolean;
}

/**
 * Get the status color based on utilization percentage (0-100+)
 */
export function getQuotaStatus(utilization: number): QuotaStatus {
  if (utilization >= 90) return "critical";
  if (utilization >= 80) return "warning";
  return "good";
}

/**
 * Format remaining time until reset
 */
export function formatResetTime(resetsAt: Date): string {
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
