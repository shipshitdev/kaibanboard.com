/**
 * Codex Review Service
 * Reviews task changes using Codex or Claude CLI
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  CodexReviewResult,
  CodexReviewStatus,
  ReviewFinding,
  ReviewFindingType,
  ReviewPromptContext,
  ReviewRating,
  ReviewSeverity,
} from "../types/review";

const execAsync = promisify(exec);

/**
 * Service for code review using Codex or Claude CLI.
 * Reviews task changes for bugs, security issues, and best practices.
 */
export class CodexReviewService {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Check if Codex CLI is available
   */
  async getCodexStatus(): Promise<CodexReviewStatus> {
    try {
      const { stdout } = await execAsync("codex --version", { timeout: 5000 });
      const versionMatch = stdout.match(/\d+\.\d+(\.\d+)?/);
      return {
        available: true,
        version: versionMatch ? versionMatch[0] : undefined,
      };
    } catch {
      // Check if Claude is available as fallback
      try {
        await execAsync("claude --version", { timeout: 5000 });
        return {
          available: false,
          error: "Codex CLI not found",
          fallbackMessage: "Using Claude CLI for review",
        };
      } catch {
        return {
          available: false,
          error: "Neither Codex nor Claude CLI is available",
        };
      }
    }
  }

  /**
   * Build the review prompt
   */
  buildReviewPrompt(context: ReviewPromptContext): string {
    let prompt = `You are a senior code reviewer. Review the following changes for a task.

## Task Information
- **Task:** ${context.taskLabel}
- **Description:** ${context.taskDescription}

## Focus Areas
${context.focusAreas.map((area) => `- ${this.getFocusAreaDescription(area)}`).join("\n")}
`;

    if (context.prdContent) {
      prompt += `
## PRD Context (abbreviated)
${context.prdContent.substring(0, 1000)}${context.prdContent.length > 1000 ? "..." : ""}
`;
    }

    prompt += `
## Files Changed
${context.filesChanged.map((f) => `- ${f}`).join("\n")}

## Diff to Review
\`\`\`diff
${context.diff.substring(0, 15000)}${context.diff.length > 15000 ? "\n... (truncated)" : ""}
\`\`\`

## Instructions

Review the code changes and provide:
1. A brief summary of what the changes do
2. An overall rating: "pass", "needs_work", or "critical_issues"
3. Specific findings with severity and suggestions
4. Actionable recommendations

Respond with JSON in this format:
{
  "summary": "Brief summary of the review",
  "overallRating": "pass|needs_work|critical_issues",
  "findings": [
    {
      "type": "bug|security|performance|style|maintainability|best_practice|documentation|test_coverage|other",
      "severity": "critical|high|medium|low|info",
      "filePath": "path/to/file",
      "lineNumber": 42,
      "description": "What the issue is",
      "suggestion": "How to fix it",
      "codeSnippet": "relevant code"
    }
  ],
  "suggestedActions": [
    "Specific action to take"
  ]
}

Be constructive and specific. Focus on real issues, not style preferences.
`;

    return prompt;
  }

  /**
   * Get description for a focus area
   */
  private getFocusAreaDescription(area: ReviewFindingType): string {
    const descriptions: Record<ReviewFindingType, string> = {
      bug: "Logic errors, incorrect behavior, edge cases",
      security: "Vulnerabilities, injection attacks, auth issues",
      performance: "Inefficient algorithms, memory leaks, slow queries",
      style: "Code style, formatting, naming conventions",
      maintainability: "Code complexity, coupling, readability",
      best_practice: "Design patterns, idiomatic code, conventions",
      documentation: "Missing comments, incorrect docs, API docs",
      test_coverage: "Missing tests, edge cases not tested",
      other: "Other concerns",
    };
    return descriptions[area] || area;
  }

  /**
   * Run review with Codex CLI
   */
  async reviewWithCodex(
    context: ReviewPromptContext,
    codexPath = "codex"
  ): Promise<CodexReviewResult> {
    const startTime = Date.now();
    const prompt = this.buildReviewPrompt(context);

    try {
      // Write prompt to temp file
      const fs = await import("node:fs");
      const tempPromptFile = `${this.workspacePath}/.kaiban-review-prompt.txt`;
      fs.writeFileSync(tempPromptFile, prompt, "utf-8");

      const command = `cat "${tempPromptFile}" | ${codexPath}`;

      const { stdout } = await execAsync(command, {
        cwd: this.workspacePath,
        timeout: 180000, // 3 minutes for thorough review
        maxBuffer: 5 * 1024 * 1024,
      });

      // Clean up temp file
      try {
        fs.unlinkSync(tempPromptFile);
      } catch {}

      return this.parseReviewResponse(stdout, context, startTime);
    } catch (error) {
      return this.createErrorResult(error, context, startTime);
    }
  }

  /**
   * Run review with Claude CLI
   */
  async reviewWithClaude(
    context: ReviewPromptContext,
    claudePath = "claude"
  ): Promise<CodexReviewResult> {
    const startTime = Date.now();
    const prompt = this.buildReviewPrompt(context);

    try {
      const fs = await import("node:fs");
      const tempPromptFile = `${this.workspacePath}/.kaiban-review-prompt.txt`;
      fs.writeFileSync(tempPromptFile, prompt, "utf-8");

      const command = `cat "${tempPromptFile}" | ${claudePath} --print`;

      const { stdout } = await execAsync(command, {
        cwd: this.workspacePath,
        timeout: 180000,
        maxBuffer: 5 * 1024 * 1024,
      });

      try {
        fs.unlinkSync(tempPromptFile);
      } catch {}

      return this.parseReviewResponse(stdout, context, startTime);
    } catch (error) {
      return this.createErrorResult(error, context, startTime);
    }
  }

  /**
   * Parse AI response into structured review result
   */
  private parseReviewResponse(
    response: string,
    context: ReviewPromptContext,
    startTime: number
  ): CodexReviewResult {
    const duration = (Date.now() - startTime) / 1000;

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.createFallbackResult(response, context, duration);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize findings
      const findings: ReviewFinding[] = (parsed.findings || []).map(
        (f: Partial<ReviewFinding>) => ({
          type: this.normalizeType(f.type),
          severity: this.normalizeSeverity(f.severity),
          filePath: f.filePath || "unknown",
          lineNumber: f.lineNumber,
          description: f.description || "No description",
          suggestion: f.suggestion,
          codeSnippet: f.codeSnippet,
        })
      );

      return {
        summary: parsed.summary || "Review completed",
        overallRating: this.normalizeRating(parsed.overallRating),
        findings,
        suggestedActions: parsed.suggestedActions || [],
        filesReviewed: context.filesChanged,
        linesReviewed: context.diff.split("\n").length,
        reviewDuration: duration,
        reviewedAt: new Date().toISOString(),
      };
    } catch {
      return this.createFallbackResult(response, context, duration);
    }
  }

  /**
   * Create a result when we can't parse the response properly
   */
  private createFallbackResult(
    response: string,
    context: ReviewPromptContext,
    duration: number
  ): CodexReviewResult {
    return {
      summary: response.substring(0, 500) || "Review completed but could not parse results",
      overallRating: "needs_work",
      findings: [
        {
          type: "other",
          severity: "info",
          filePath: "general",
          description: "AI response could not be parsed. Please review manually.",
          suggestion: "Check the full AI response for details",
        },
      ],
      suggestedActions: ["Review the changes manually"],
      filesReviewed: context.filesChanged,
      linesReviewed: context.diff.split("\n").length,
      reviewDuration: duration,
      reviewedAt: new Date().toISOString(),
    };
  }

  /**
   * Create error result
   */
  private createErrorResult(
    error: unknown,
    context: ReviewPromptContext,
    startTime: number
  ): CodexReviewResult {
    return {
      summary: `Review failed: ${error instanceof Error ? error.message : String(error)}`,
      overallRating: "needs_work",
      findings: [],
      suggestedActions: ["Try running the review again", "Review manually if issues persist"],
      filesReviewed: context.filesChanged,
      linesReviewed: context.diff.split("\n").length,
      reviewDuration: (Date.now() - startTime) / 1000,
      reviewedAt: new Date().toISOString(),
    };
  }

  /**
   * Normalize finding type
   */
  private normalizeType(type?: string): ReviewFindingType {
    const validTypes: ReviewFindingType[] = [
      "bug",
      "security",
      "performance",
      "style",
      "maintainability",
      "best_practice",
      "documentation",
      "test_coverage",
      "other",
    ];
    return validTypes.includes(type as ReviewFindingType) ? (type as ReviewFindingType) : "other";
  }

  /**
   * Normalize severity
   */
  private normalizeSeverity(severity?: string): ReviewSeverity {
    const validSeverities: ReviewSeverity[] = ["critical", "high", "medium", "low", "info"];
    return validSeverities.includes(severity as ReviewSeverity)
      ? (severity as ReviewSeverity)
      : "medium";
  }

  /**
   * Normalize rating
   */
  private normalizeRating(rating?: string): ReviewRating {
    const validRatings: ReviewRating[] = ["pass", "needs_work", "critical_issues"];
    return validRatings.includes(rating as ReviewRating) ? (rating as ReviewRating) : "needs_work";
  }

  /**
   * Run review with best available provider
   */
  async runReview(context: ReviewPromptContext, preferCodex = true): Promise<CodexReviewResult> {
    const status = await this.getCodexStatus();

    if (preferCodex && status.available) {
      return this.reviewWithCodex(context);
    }

    // Try Claude as fallback
    try {
      await execAsync("claude --version", { timeout: 5000 });
      return this.reviewWithClaude(context);
    } catch {
      return {
        summary: "No review provider available",
        overallRating: "needs_work",
        findings: [
          {
            type: "other",
            severity: "info",
            filePath: "general",
            description: "Neither Codex nor Claude CLI is available for review",
            suggestion: "Install Codex CLI or Claude CLI to enable code review",
          },
        ],
        suggestedActions: [
          "Install Codex CLI: npm install -g @openai/codex",
          "Or install Claude CLI: npm install -g @anthropic-ai/claude-cli",
        ],
        filesReviewed: context.filesChanged,
        linesReviewed: 0,
        reviewDuration: 0,
        reviewedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Format review result for display
   */
  formatReviewForDisplay(result: CodexReviewResult): string {
    let output = `## Code Review\n\n`;
    output += `**Rating:** ${this.getRatingEmoji(result.overallRating)} ${result.overallRating}\n\n`;
    output += `**Summary:** ${result.summary}\n\n`;

    if (result.findings.length > 0) {
      output += `### Findings (${result.findings.length})\n\n`;

      const sortedFindings = [...result.findings].sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });

      for (const finding of sortedFindings) {
        output += `- ${this.getSeverityEmoji(finding.severity)} **[${finding.severity.toUpperCase()}]** `;
        output += `${finding.filePath}`;
        if (finding.lineNumber) {
          output += `:${finding.lineNumber}`;
        }
        output += `\n  ${finding.description}`;
        if (finding.suggestion) {
          output += `\n  *Suggestion:* ${finding.suggestion}`;
        }
        output += "\n\n";
      }
    }

    if (result.suggestedActions.length > 0) {
      output += `### Suggested Actions\n\n`;
      for (const action of result.suggestedActions) {
        output += `- [ ] ${action}\n`;
      }
    }

    output += `\n---\n`;
    output += `*Reviewed ${result.filesReviewed.length} files in ${result.reviewDuration.toFixed(1)}s*`;

    return output;
  }

  /**
   * Get emoji for rating
   */
  private getRatingEmoji(rating: ReviewRating): string {
    const emojis: Record<ReviewRating, string> = {
      pass: "✅",
      needs_work: "⚠️",
      critical_issues: "❌",
    };
    return emojis[rating];
  }

  /**
   * Get emoji for severity
   */
  private getSeverityEmoji(severity: ReviewSeverity): string {
    const emojis: Record<ReviewSeverity, string> = {
      critical: "🔴",
      high: "🟠",
      medium: "🟡",
      low: "🟢",
      info: "🔵",
    };
    return emojis[severity];
  }
}
