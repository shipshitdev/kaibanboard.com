import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { ensureDirectoryExists, getPRDBasePath, slugify } from "../utils/fileUtils";

export interface PRDInterviewOptions {
  /** Name/topic of the PRD */
  name: string;
  /** Optional task context if created from a task */
  taskContext?: {
    taskId: string;
    label: string;
    description?: string;
  };
}

export interface PRDInterviewResult {
  /** Path to the created PRD file */
  prdPath: string;
  /** Slug used for the filename */
  slug: string;
  /** The terminal instance running the interview */
  terminal: vscode.Terminal;
}

/**
 * Service for creating PRDs through an interview-based approach using Claude CLI.
 * Instead of a static template, this opens Claude in the terminal to conduct
 * an in-depth interview with the user about their requirements.
 */
export class PRDInterviewService {
  /**
   * Start an interview-based PRD creation process.
   *
   * 1. Creates a minimal PRD template file
   * 2. Opens Claude CLI in terminal with interview prompt
   * 3. Claude interviews the user and writes the complete spec
   */
  async startInterview(options: PRDInterviewOptions): Promise<PRDInterviewResult | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder open");
      return null;
    }

    const workspaceFolder = workspaceFolders[0];
    const prdBasePath = getPRDBasePath(workspaceFolder);

    // Generate slug and filename
    const slug = slugify(options.name);
    const prdFileName = `${slug}.md`;
    const prdFilePath = path.join(prdBasePath, prdFileName);

    // Ensure PRD directory exists
    await ensureDirectoryExists(prdBasePath);

    // Create minimal PRD template
    const template = this.generateMinimalTemplate(options.name);
    fs.writeFileSync(prdFilePath, template, "utf-8");

    // Get relative path for the Claude prompt
    const relativePrdPath = path.relative(workspaceFolder.uri.fsPath, prdFilePath);

    // Build the interview prompt
    const interviewPrompt = this.buildInterviewPrompt(relativePrdPath, options.taskContext);

    // Get Claude CLI configuration
    const config = vscode.workspace.getConfiguration("kaiban.claude");
    const claudePath = config.get<string>("executablePath", "claude");
    const additionalFlags = config.get<string>("additionalFlags", "");

    // Build command
    const flags = additionalFlags ? `${additionalFlags} ` : "";
    const escapedPrompt = this.escapeForShell(interviewPrompt);
    const fullCommand = `${claudePath} ${flags}"${escapedPrompt}"`;

    // Create and show terminal
    const terminal = vscode.window.createTerminal({
      name: `PRD Interview: ${options.name.substring(0, 30)}`,
      cwd: workspaceFolder.uri.fsPath,
    });

    terminal.show();
    terminal.sendText(fullCommand);

    vscode.window.showInformationMessage(
      `PRD template created at ${relativePrdPath}. Claude will interview you to complete the spec.`
    );

    return {
      prdPath: prdFilePath,
      slug,
      terminal,
    };
  }

  /**
   * Generate a minimal PRD template with placeholder sections.
   * Claude will fill these in based on the interview.
   */
  private generateMinimalTemplate(name: string): string {
    const now = new Date().toISOString().split("T")[0];
    return `# PRD: ${name}

**Created:** ${now}
**Status:** Draft

---

## Overview
_To be filled via interview_

## Problem Statement
_To be filled via interview_

## Goals
_To be filled via interview_

## Requirements
### Functional Requirements
_To be filled via interview_

### Non-Functional Requirements
_To be filled via interview_

## User Stories
_To be filled via interview_

## Acceptance Criteria
_To be filled via interview_

## Technical Considerations
_To be filled via interview_

## Out of Scope
_To be filled via interview_
`;
  }

  /**
   * Build the interview prompt for Claude CLI.
   * Uses the AskUserQuestionTool for in-depth requirements gathering.
   */
  private buildInterviewPrompt(
    prdPath: string,
    taskContext?: PRDInterviewOptions["taskContext"]
  ): string {
    let contextSection = "";
    if (taskContext) {
      contextSection = `\n\nTask context:
- Task ID: ${taskContext.taskId}
- Label: ${taskContext.label}
${taskContext.description ? `- Description: ${taskContext.description}` : ""}`;
    }

    return `Read this @${prdPath} and interview me in detail using the AskUserQuestionTool about literally anything: technical implementation, UI & UX, concerns, tradeoffs, etc. but make sure the questions are not obvious. Be very in-depth and continue interviewing me continually until it's complete, then write the spec to the file.${contextSection}`;
  }

  /**
   * Escape string for shell command.
   */
  private escapeForShell(str: string): string {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`");
  }
}
