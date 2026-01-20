import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  CodexAuthFile,
  CodexQuotaDisplayData,
  CodexUsage,
  CodexUsageResponse,
} from "../types/codexQuota";

const USAGE_API_URL = "https://chatgpt.com/backend-api/wham/usage";
const AUTH_FILE_PATH = path.join(os.homedir(), ".codex", "auth.json");

/**
 * Service for fetching Codex CLI usage quota from auth file and ChatGPT API.
 * This service reads the OAuth token from Codex CLI's auth file
 * and fetches usage data from the ChatGPT backend API.
 */
export class CodexQuotaService {
  private cachedUsage: CodexUsage | null = null;

  /**
   * Check if Codex auth file exists
   */
  isAvailable(): boolean {
    return fs.existsSync(AUTH_FILE_PATH);
  }

  /**
   * Get Codex credentials from auth file (~/.codex/auth.json)
   */
  getCredentials(): { accessToken: string; accountId?: string } | null {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const authContent = fs.readFileSync(AUTH_FILE_PATH, "utf-8");
      const authData = JSON.parse(authContent) as CodexAuthFile;

      if (!authData.tokens?.accessToken) {
        return null;
      }

      return {
        accessToken: authData.tokens.accessToken,
        accountId: authData.tokens.accountId,
      };
    } catch {
      // Auth file not found or invalid
      return null;
    }
  }

  /**
   * Fetch usage data from ChatGPT API
   */
  async fetchUsage(accessToken: string, accountId?: string): Promise<CodexUsage | null> {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        // Browser-like headers for ChatGPT API
        Origin: "https://chatgpt.com",
        Referer: "https://chatgpt.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      };

      // Critical: accountId is required for team accounts
      if (accountId) {
        headers["ChatGPT-Account-Id"] = accountId;
      }

      const response = await fetch(USAGE_API_URL, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        console.error(`Codex Usage API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = (await response.json()) as CodexUsageResponse;

      const usage: CodexUsage = {
        sessionLimit: null,
        weeklyLimit: null,
        codeReviewLimit: null,
        planType: data.plan_type || "unknown",
        lastUpdated: new Date(),
      };

      // Parse rate_limit primary_window (5h session)
      if (data.rate_limit?.primary_window) {
        const pw = data.rate_limit.primary_window;
        usage.sessionLimit = {
          utilization: pw.used_percent,
          resetsAt: new Date(pw.reset_at * 1000),
          windowSeconds: pw.limit_window_seconds,
        };
      }

      // Parse rate_limit secondary_window (7d weekly)
      if (data.rate_limit?.secondary_window) {
        const sw = data.rate_limit.secondary_window;
        usage.weeklyLimit = {
          utilization: sw.used_percent,
          resetsAt: new Date(sw.reset_at * 1000),
          windowSeconds: sw.limit_window_seconds,
        };
      }

      // Parse code_review_rate_limit
      if (data.code_review_rate_limit?.primary_window) {
        const cr = data.code_review_rate_limit.primary_window;
        usage.codeReviewLimit = {
          utilization: cr.used_percent,
          resetsAt: new Date(cr.reset_at * 1000),
          windowSeconds: cr.limit_window_seconds,
        };
      }

      this.cachedUsage = usage;
      return usage;
    } catch (error) {
      console.error("Failed to fetch Codex usage:", error);
      return null;
    }
  }

  /**
   * Get current quota data (fetches from API or returns cached)
   */
  async getQuota(): Promise<CodexQuotaDisplayData> {
    const isAvailable = this.isAvailable();

    if (!isAvailable) {
      return {
        usage: null,
        error: "Codex CLI not installed. Run 'codex login' to authenticate.",
        isLoading: false,
        isAvailable: false,
      };
    }

    const credentials = this.getCredentials();

    if (!credentials?.accessToken) {
      return {
        usage: null,
        error: "Codex CLI not authenticated. Run 'codex login' to authenticate.",
        isLoading: false,
        isAvailable: true,
      };
    }

    const usage = await this.fetchUsage(credentials.accessToken, credentials.accountId);

    if (!usage) {
      // Return cached if fetch failed
      if (this.cachedUsage) {
        return {
          usage: this.cachedUsage,
          error: "Failed to refresh quota. Showing cached data.",
          isLoading: false,
          isAvailable: true,
        };
      }

      return {
        usage: null,
        error: "Failed to fetch quota data",
        isLoading: false,
        isAvailable: true,
      };
    }

    return {
      usage,
      error: null,
      isLoading: false,
      isAvailable: true,
    };
  }

  /**
   * Get cached quota without fetching
   */
  getCachedQuota(): CodexUsage | null {
    return this.cachedUsage;
  }

  /**
   * Clear cached quota
   */
  clearCache(): void {
    this.cachedUsage = null;
  }
}
