import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  ClaudeCodeCredentials,
  ClaudeCodeUsage,
  ClaudeCodeUsageResponse,
  QuotaDisplayData,
} from "../types/claudeQuota";

const execAsync = promisify(exec);

const USAGE_API_URL = "https://api.anthropic.com/api/oauth/usage";
const KEYCHAIN_SERVICE = "Claude Code-credentials";

/**
 * Service for fetching Claude Code usage quota from macOS keychain and API.
 * This service reads the OAuth token from Claude CLI's keychain entry
 * and fetches usage data from Anthropic's API.
 */
export class ClaudeCodeQuotaService {
  private cachedUsage: ClaudeCodeUsage | null = null;

  /**
   * Check if running on macOS
   */
  isMacOS(): boolean {
    return process.platform === "darwin";
  }

  /**
   * Get Claude Code credentials from macOS keychain
   */
  async getCredentials(): Promise<ClaudeCodeCredentials | null> {
    if (!this.isMacOS()) {
      return null;
    }

    try {
      const { stdout } = await execAsync(
        `security find-generic-password -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null`
      );

      const credentialsJson = stdout.trim();
      if (!credentialsJson) {
        return null;
      }

      const credentials = JSON.parse(credentialsJson) as ClaudeCodeCredentials;
      return credentials;
    } catch {
      // Keychain entry not found or other error
      return null;
    }
  }

  /**
   * Fetch usage data from Anthropic API
   */
  async fetchUsage(accessToken: string): Promise<ClaudeCodeUsage | null> {
    try {
      const response = await fetch(USAGE_API_URL, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "anthropic-beta": "oauth-2025-04-20",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error(`Usage API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = (await response.json()) as ClaudeCodeUsageResponse;

      const usage: ClaudeCodeUsage = {
        fiveHour: {
          utilization: data.five_hour.utilization,
          resetsAt: new Date(data.five_hour.resets_at),
        },
        sevenDay: {
          utilization: data.seven_day.utilization,
          resetsAt: new Date(data.seven_day.resets_at),
        },
        lastUpdated: new Date(),
      };

      if (data.seven_day_sonnet) {
        usage.sevenDaySonnet = {
          utilization: data.seven_day_sonnet.utilization,
          resetsAt: new Date(data.seven_day_sonnet.resets_at),
        };
      }

      this.cachedUsage = usage;
      return usage;
    } catch (error) {
      console.error("Failed to fetch usage:", error);
      return null;
    }
  }

  /**
   * Get current quota data (fetches from API or returns cached)
   */
  async getQuota(): Promise<QuotaDisplayData> {
    const isMacOS = this.isMacOS();

    if (!isMacOS) {
      return {
        usage: null,
        error: "Claude CLI quota is only available on macOS",
        isLoading: false,
        isMacOS: false,
      };
    }

    const credentials = await this.getCredentials();

    if (!credentials?.claudeAiOauth?.accessToken) {
      return {
        usage: null,
        error: "Claude CLI not authenticated. Run 'claude login' to authenticate.",
        isLoading: false,
        isMacOS: true,
      };
    }

    const usage = await this.fetchUsage(credentials.claudeAiOauth.accessToken);

    if (!usage) {
      // Return cached if fetch failed
      if (this.cachedUsage) {
        return {
          usage: this.cachedUsage,
          error: "Failed to refresh quota. Showing cached data.",
          isLoading: false,
          isMacOS: true,
        };
      }

      return {
        usage: null,
        error: "Failed to fetch quota data",
        isLoading: false,
        isMacOS: true,
      };
    }

    return {
      usage,
      error: null,
      isLoading: false,
      isMacOS: true,
    };
  }

  /**
   * Get cached quota without fetching
   */
  getCachedQuota(): ClaudeCodeUsage | null {
    return this.cachedUsage;
  }

  /**
   * Clear cached quota
   */
  clearCache(): void {
    this.cachedUsage = null;
  }
}
