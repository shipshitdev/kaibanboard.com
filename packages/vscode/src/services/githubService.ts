/**
 * GitHub Service
 * Integrates with GitHub via gh CLI for issue sync and PR creation
 */

import { exec } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import type {
  GitHubCLIStatus,
  GitHubImportOptions,
  GitHubIssue,
  GitHubMetadata,
  GitHubPR,
  GitHubPRCreateOptions,
  GitHubPRCreateResult,
} from "../types/github";

const execAsync = promisify(exec);

/** Cache timeout in milliseconds (5 minutes) */
const CACHE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Service for GitHub integration via gh CLI.
 * Supports issue import, PR creation, and status sync.
 */
export class GitHubService {
  private workspacePath: string;
  private cachedStatus: GitHubCLIStatus | null = null;
  private cacheTimestamp = 0;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Check if gh CLI is available and authenticated
   */
  async getStatus(forceRefresh = false): Promise<GitHubCLIStatus> {
    const now = Date.now();

    if (!forceRefresh && this.cachedStatus && now - this.cacheTimestamp < CACHE_TIMEOUT_MS) {
      return this.cachedStatus;
    }

    const status: GitHubCLIStatus = {
      available: false,
      authenticated: false,
    };

    try {
      // Check if gh is available
      const { stdout: versionOutput } = await execAsync("gh --version", {
        timeout: 5000,
      });
      const versionMatch = versionOutput.match(/gh version (\d+\.\d+\.\d+)/);
      if (versionMatch) {
        status.available = true;
        status.version = versionMatch[1];
      }

      // Check if authenticated
      try {
        await execAsync("gh auth status", {
          timeout: 5000,
          cwd: this.workspacePath,
        });
        status.authenticated = true;
      } catch {
        status.authenticated = false;
      }

      // Get current repository
      if (status.authenticated) {
        try {
          const { stdout: repoOutput } = await execAsync(
            "gh repo view --json nameWithOwner -q .nameWithOwner",
            { cwd: this.workspacePath, timeout: 5000 }
          );
          status.currentRepository = repoOutput.trim();
        } catch {
          // Not in a GitHub repo
        }
      }
    } catch (error) {
      status.error = error instanceof Error ? error.message : "gh CLI not found";
    }

    this.cachedStatus = status;
    this.cacheTimestamp = now;
    return status;
  }

  /**
   * Clear the status cache
   */
  clearCache(): void {
    this.cachedStatus = null;
    this.cacheTimestamp = 0;
  }

  /**
   * List GitHub issues
   */
  async listIssues(options: GitHubImportOptions = {}): Promise<GitHubIssue[]> {
    const status = await this.getStatus();
    if (!status.available || !status.authenticated) {
      throw new Error("GitHub CLI not available or not authenticated");
    }

    const limit = options.limit || 30;
    const state = options.state || "open";
    const labels = options.labels?.join(",") || "";
    const assignee = options.assignee || "";

    let command = `gh issue list --json number,title,body,state,url,labels,assignees,createdAt,updatedAt --limit ${limit}`;

    if (state !== "all") {
      command += ` --state ${state}`;
    }
    if (labels) {
      command += ` --label "${labels}"`;
    }
    if (assignee) {
      command += ` --assignee "${assignee}"`;
    }

    try {
      const { stdout } = await execAsync(command, {
        cwd: this.workspacePath,
        timeout: 30000,
      });

      const issues = JSON.parse(stdout);
      return issues.map(
        (issue: {
          number: number;
          title: string;
          body: string;
          state: string;
          url: string;
          labels: Array<{ name: string }>;
          assignees: Array<{ login: string }>;
          createdAt: string;
          updatedAt: string;
        }) => ({
          number: issue.number,
          title: issue.title,
          body: issue.body || "",
          state: issue.state.toLowerCase(),
          url: issue.url,
          labels: issue.labels.map((l: { name: string }) => l.name),
          assignees: issue.assignees.map((a: { login: string }) => a.login),
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          repository: status.currentRepository,
        })
      );
    } catch (error) {
      throw new Error(`Failed to list issues: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get a single issue by number
   */
  async getIssue(issueNumber: number): Promise<GitHubIssue | null> {
    const status = await this.getStatus();
    if (!status.available || !status.authenticated) {
      return null;
    }

    try {
      const { stdout } = await execAsync(
        `gh issue view ${issueNumber} --json number,title,body,state,url,labels,assignees,createdAt,updatedAt`,
        { cwd: this.workspacePath, timeout: 10000 }
      );

      const issue = JSON.parse(stdout);
      return {
        number: issue.number,
        title: issue.title,
        body: issue.body || "",
        state: issue.state.toLowerCase(),
        url: issue.url,
        labels: issue.labels.map((l: { name: string }) => l.name),
        assignees: issue.assignees.map((a: { login: string }) => a.login),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        repository: status.currentRepository,
      };
    } catch {
      return null;
    }
  }

  /**
   * Create a task file from a GitHub issue
   */
  generateTaskFromIssue(
    issue: GitHubIssue,
    tasksPath: string
  ): {
    filePath: string;
    content: string;
    metadata: GitHubMetadata;
  } {
    const now = new Date().toISOString();
    const dateStr = now.split("T")[0];

    // Generate slug from title
    const slug = issue.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 50);

    const filePath = path.join(tasksPath, `${slug}.md`);
    const taskId = `gh-${issue.number}`;

    // Determine priority from labels
    let priority = "Medium";
    if (
      issue.labels.some(
        (l) => l.toLowerCase().includes("urgent") || l.toLowerCase().includes("critical")
      )
    ) {
      priority = "High";
    } else if (issue.labels.some((l) => l.toLowerCase().includes("low"))) {
      priority = "Low";
    }

    // Determine type from labels
    let type = "Task";
    if (issue.labels.some((l) => l.toLowerCase().includes("bug"))) {
      type = "Bug";
    } else if (issue.labels.some((l) => l.toLowerCase().includes("feature"))) {
      type = "Feature";
    } else if (issue.labels.some((l) => l.toLowerCase().includes("enhancement"))) {
      type = "Enhancement";
    }

    const content = `## Task: ${issue.title}

**ID:** ${taskId}
**Label:** ${issue.title}
**Description:** ${issue.body.split("\n")[0] || "Imported from GitHub issue"}
**Type:** ${type}
**Status:** Backlog
**Priority:** ${priority}
**Created:** ${dateStr}
**Updated:** ${dateStr}
**PRD:**
**GitHub:** [Issue #${issue.number}](${issue.url})

---

## Issue Details

${issue.body || "No description provided."}

---

## Metadata

- **Labels:** ${issue.labels.join(", ") || "None"}
- **Assignees:** ${issue.assignees.join(", ") || "Unassigned"}
- **Created:** ${issue.createdAt}
`;

    const metadata: GitHubMetadata = {
      issueUrl: issue.url,
      issueNumber: issue.number,
      repository: issue.repository,
      issueState: issue.state as "open" | "closed",
      lastSynced: now,
    };

    return { filePath, content, metadata };
  }

  /**
   * Create a PR from a task branch
   */
  async createPR(
    branchName: string,
    options: GitHubPRCreateOptions
  ): Promise<GitHubPRCreateResult> {
    const status = await this.getStatus();
    if (!status.available || !status.authenticated) {
      return { success: false, error: "GitHub CLI not available or not authenticated" };
    }

    try {
      const title = options.title || branchName;
      const body = options.body || "";
      const baseBranch = options.baseBranch || "main";
      const draft = options.draft ? "--draft" : "";

      let command = `gh pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --base "${baseBranch}" ${draft}`;

      if (options.labels && options.labels.length > 0) {
        command += ` --label "${options.labels.join(",")}"`;
      }
      if (options.reviewers && options.reviewers.length > 0) {
        command += ` --reviewer "${options.reviewers.join(",")}"`;
      }

      const { stdout } = await execAsync(command, {
        cwd: this.workspacePath,
        timeout: 30000,
      });

      // The output is the PR URL
      const prUrl = stdout.trim();

      // Get PR details
      const { stdout: prDetails } = await execAsync(
        `gh pr view "${prUrl}" --json number,title,body,state,url,headRefName,baseRefName,isDraft,createdAt,updatedAt`,
        { cwd: this.workspacePath, timeout: 10000 }
      );

      const pr = JSON.parse(prDetails);
      return {
        success: true,
        pr: {
          number: pr.number,
          title: pr.title,
          body: pr.body || "",
          state: pr.isDraft ? "draft" : pr.state.toLowerCase(),
          url: pr.url,
          headBranch: pr.headRefName,
          baseBranch: pr.baseRefName,
          isDraft: pr.isDraft,
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get PR for a branch
   */
  async getPRForBranch(branchName: string): Promise<GitHubPR | null> {
    const status = await this.getStatus();
    if (!status.available || !status.authenticated) {
      return null;
    }

    try {
      const { stdout } = await execAsync(
        `gh pr view "${branchName}" --json number,title,body,state,url,headRefName,baseRefName,isDraft,createdAt,updatedAt`,
        { cwd: this.workspacePath, timeout: 10000 }
      );

      const pr = JSON.parse(stdout);
      return {
        number: pr.number,
        title: pr.title,
        body: pr.body || "",
        state: pr.isDraft ? "draft" : pr.state.toLowerCase(),
        url: pr.url,
        headBranch: pr.headRefName,
        baseBranch: pr.baseRefName,
        isDraft: pr.isDraft,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
      };
    } catch {
      return null;
    }
  }

  /**
   * Close an issue
   */
  async closeIssue(
    issueNumber: number,
    comment?: string
  ): Promise<{ success: boolean; error?: string }> {
    const status = await this.getStatus();
    if (!status.available || !status.authenticated) {
      return { success: false, error: "GitHub CLI not available" };
    }

    try {
      if (comment) {
        await execAsync(
          `gh issue comment ${issueNumber} --body "${comment.replace(/"/g, '\\"')}"`,
          { cwd: this.workspacePath, timeout: 10000 }
        );
      }

      await execAsync(`gh issue close ${issueNumber}`, {
        cwd: this.workspacePath,
        timeout: 10000,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Link a PR to an issue (adds "Closes #N" to PR body)
   */
  async linkPRToIssue(
    prNumber: number,
    issueNumber: number
  ): Promise<{ success: boolean; error?: string }> {
    const status = await this.getStatus();
    if (!status.available || !status.authenticated) {
      return { success: false, error: "GitHub CLI not available" };
    }

    try {
      // Get current PR body
      const { stdout } = await execAsync(`gh pr view ${prNumber} --json body -q .body`, {
        cwd: this.workspacePath,
        timeout: 10000,
      });

      const currentBody = stdout.trim();
      const closesLine = `Closes #${issueNumber}`;

      // Check if already linked
      if (currentBody.includes(closesLine)) {
        return { success: true };
      }

      // Add closes line
      const newBody = `${currentBody}\n\n${closesLine}`;
      await execAsync(`gh pr edit ${prNumber} --body "${newBody.replace(/"/g, '\\"')}"`, {
        cwd: this.workspacePath,
        timeout: 10000,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate GitHub metadata from issue URL or number
   */
  parseIssueUrl(url: string): { repository: string; issueNumber: number } | null {
    // Match: https://github.com/owner/repo/issues/123
    const match = url.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
    if (match) {
      return {
        repository: match[1],
        issueNumber: parseInt(match[2], 10),
      };
    }
    return null;
  }

  /**
   * Generate PR body from task and PRD content
   */
  generatePRBody(
    taskLabel: string,
    taskDescription: string,
    prdContent?: string,
    issueNumber?: number
  ): string {
    let body = `## Summary\n\n`;
    body += `${taskDescription || taskLabel}\n\n`;

    if (prdContent) {
      // Extract key sections from PRD
      const overviewMatch = prdContent.match(/## Overview\s*\n([\s\S]*?)(?=\n##|$)/);
      if (overviewMatch) {
        body += `### Context\n\n${overviewMatch[1].trim().substring(0, 500)}\n\n`;
      }
    }

    body += `## Changes\n\n`;
    body += `- Implemented ${taskLabel}\n`;
    body += `- See commit messages for details\n\n`;

    body += `## Test Plan\n\n`;
    body += `- [ ] Verify functionality works as expected\n`;
    body += `- [ ] Run existing tests\n`;
    body += `- [ ] Manual testing completed\n\n`;

    if (issueNumber) {
      body += `Closes #${issueNumber}\n\n`;
    }

    body += `---\n`;
    body += `*Generated by Kaiban Board*`;

    return body;
  }
}
