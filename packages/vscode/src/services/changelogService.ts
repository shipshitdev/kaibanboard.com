/**
 * Changelog Service
 * Generates changelogs from completed tasks
 */

import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import type { Task } from "@kaibanboard/core";
import type {
  ChangelogEntry,
  ChangelogFormat,
  ChangelogOptions,
  ChangelogResult,
  ChangelogType,
} from "../types/changelog";
import { DEFAULT_CHANGELOG_OPTIONS, TASK_TYPE_TO_CHANGELOG } from "../types/changelog";

const execAsync = promisify(exec);

export class ChangelogService {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Get the latest git tag
   */
  async getLatestTag(): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git describe --tags --abbrev=0", {
        cwd: this.workspacePath,
        timeout: 5000,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Get the date of a git tag
   */
  async getTagDate(tag: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`git log -1 --format=%aI "${tag}"`, {
        cwd: this.workspacePath,
        timeout: 5000,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Get all git tags sorted by date (newest first)
   */
  async getAllTags(): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        'git tag --sort=-creatordate --format="%(refname:short)"',
        {
          cwd: this.workspacePath,
          timeout: 5000,
        }
      );
      return stdout
        .trim()
        .split("\n")
        .filter((t) => t.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Filter completed tasks since a given date or tag
   */
  getCompletedTasksSince(tasks: Task[], since?: string): Task[] {
    const completedTasks = tasks.filter((task) => task.status === "Done" && task.completedAt);

    if (!since) {
      return completedTasks;
    }

    // Parse the since value - could be a date (YYYY-MM-DD) or we'll compare directly
    const sinceDate = new Date(since);
    const isValidDate = !Number.isNaN(sinceDate.getTime());

    if (!isValidDate) {
      // If not a valid date, return all completed tasks
      return completedTasks;
    }

    return completedTasks.filter((task) => {
      const taskDate = new Date(task.completedAt);
      return !Number.isNaN(taskDate.getTime()) && taskDate >= sinceDate;
    });
  }

  /**
   * Convert a task to a changelog entry
   */
  taskToChangelogEntry(task: Task): ChangelogEntry {
    const type = TASK_TYPE_TO_CHANGELOG[task.type] || "Other";

    return {
      taskId: task.id,
      title: task.label,
      type: type as ChangelogType,
      completedAt: task.completedAt,
      description: task.description,
      prdPath: task.prdPath,
    };
  }

  /**
   * Group entries by type for Keep a Changelog format
   */
  groupEntriesByType(entries: ChangelogEntry[]): Map<ChangelogType, ChangelogEntry[]> {
    const grouped = new Map<ChangelogType, ChangelogEntry[]>();

    for (const entry of entries) {
      const existing = grouped.get(entry.type) || [];
      existing.push(entry);
      grouped.set(entry.type, existing);
    }

    return grouped;
  }

  /**
   * Format changelog as Keep a Changelog format
   */
  formatAsKeepAChangelog(entries: ChangelogEntry[], version?: string, date?: string): string {
    const grouped = this.groupEntriesByType(entries);
    const today = date || new Date().toISOString().split("T")[0];
    const versionStr = version || "Unreleased";

    const lines: string[] = [];
    lines.push(`## [${versionStr}] - ${today}`);
    lines.push("");

    // Order: Added, Changed, Fixed, Breaking Changes, Other
    const typeOrder: ChangelogType[] = ["Added", "Changed", "Fixed", "Breaking Changes", "Other"];

    for (const type of typeOrder) {
      const typeEntries = grouped.get(type);
      if (typeEntries && typeEntries.length > 0) {
        lines.push(`### ${type}`);
        lines.push("");
        for (const entry of typeEntries) {
          lines.push(`- ${entry.title}`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * Format changelog as simple markdown
   */
  formatAsMarkdown(entries: ChangelogEntry[], version?: string): string {
    const today = new Date().toISOString().split("T")[0];
    const versionStr = version || "Unreleased";

    const lines: string[] = [];
    lines.push(`# Changelog - ${versionStr}`);
    lines.push("");
    lines.push(`_Generated on ${today}_`);
    lines.push("");

    for (const entry of entries) {
      lines.push(`## ${entry.title}`);
      lines.push("");
      lines.push(`- **Type:** ${entry.type}`);
      lines.push(`- **Completed:** ${entry.completedAt.split("T")[0]}`);
      if (entry.description) {
        lines.push("");
        lines.push(entry.description);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Format changelog as JSON
   */
  formatAsJson(entries: ChangelogEntry[], version?: string): string {
    const data = {
      version: version || "unreleased",
      generatedAt: new Date().toISOString(),
      entries,
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Generate changelog content based on format
   */
  formatChangelog(entries: ChangelogEntry[], format: ChangelogFormat, version?: string): string {
    switch (format) {
      case "keepachangelog":
        return this.formatAsKeepAChangelog(entries, version);
      case "json":
        return this.formatAsJson(entries, version);
      default:
        return this.formatAsMarkdown(entries, version);
    }
  }

  /**
   * Read existing changelog to append to
   */
  readExistingChangelog(outputPath: string): string | null {
    const fullPath = path.join(this.workspacePath, outputPath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, "utf-8");
    }
    return null;
  }

  /**
   * Append new changelog entries to existing file
   */
  appendToChangelog(
    newContent: string,
    existingContent: string | null,
    format: ChangelogFormat
  ): string {
    if (!existingContent) {
      // Create new changelog with header
      if (format === "keepachangelog") {
        const header = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;
        return header + newContent;
      }
      return newContent;
    }

    if (format === "json") {
      // For JSON, we'd need to merge the data structures
      return newContent;
    }

    // For markdown formats, insert after the header
    const lines = existingContent.split("\n");
    let insertIndex = 0;

    // Find where to insert (after the initial header/description)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for the first ## heading that starts a version section
      if (line.startsWith("## [") || line.startsWith("## Unreleased")) {
        insertIndex = i;
        break;
      }
      // If we hit the end of the preamble, insert there
      if (i > 0 && line.trim() === "" && lines[i - 1].trim() === "") {
        insertIndex = i;
        break;
      }
    }

    // If no insertion point found, append at end
    if (insertIndex === 0 && lines.length > 5) {
      insertIndex = lines.length;
    }

    const result = [...lines.slice(0, insertIndex), newContent, ...lines.slice(insertIndex)].join(
      "\n"
    );

    return result;
  }

  /**
   * Write changelog to file
   */
  writeChangelog(outputPath: string, content: string): void {
    const fullPath = path.join(this.workspacePath, outputPath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, "utf-8");
  }

  /**
   * Generate changelog from tasks
   */
  async generateChangelog(
    tasks: Task[],
    options: Partial<ChangelogOptions> = {}
  ): Promise<ChangelogResult> {
    const opts: ChangelogOptions = {
      ...DEFAULT_CHANGELOG_OPTIONS,
      ...options,
    } as ChangelogOptions;

    try {
      // If since is a tag, get its date
      let sinceDate = opts.since;
      if (sinceDate?.startsWith("v")) {
        const tagDate = await this.getTagDate(sinceDate);
        if (tagDate) {
          sinceDate = tagDate;
        }
      }

      // Filter completed tasks
      const completedTasks = this.getCompletedTasksSince(tasks, sinceDate);

      if (completedTasks.length === 0) {
        return {
          success: true,
          content: "",
          entryCount: 0,
          error: "No completed tasks found since the specified date/tag",
        };
      }

      // Convert to changelog entries
      const entries = completedTasks.map((task) => this.taskToChangelogEntry(task));

      // Sort by completion date (newest first)
      entries.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

      // Format changelog
      const newContent = this.formatChangelog(entries, opts.format, opts.version);

      if (opts.dryRun) {
        return {
          success: true,
          content: newContent,
          entryCount: entries.length,
        };
      }

      // Read existing changelog and append
      const outputPath = opts.outputPath ?? "CHANGELOG.md";
      const existingContent = this.readExistingChangelog(outputPath);
      const finalContent = this.appendToChangelog(newContent, existingContent, opts.format);

      // Write to file
      this.writeChangelog(outputPath, finalContent);

      return {
        success: true,
        content: newContent,
        entryCount: entries.length,
        outputPath: opts.outputPath,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        entryCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
