import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

/**
 * Convert a string to a URL-safe slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Get the workspace folder for file operations
 */
export function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  // Use the first workspace folder
  return folders[0];
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get the PRD base path from configuration
 */
export function getPRDBasePath(workspaceFolder: vscode.WorkspaceFolder): string {
  const config = vscode.workspace.getConfiguration("kaiban.prd");
  const basePath = config.get<string>("basePath", ".agent/PRDS");
  return path.join(workspaceFolder.uri.fsPath, basePath);
}

/**
 * Get the TASKS base path
 */
export function getTasksBasePath(workspaceFolder: vscode.WorkspaceFolder): string {
  return path.join(workspaceFolder.uri.fsPath, ".agent", "TASKS");
}

/**
 * Generate a unique file name by appending a number if file exists
 */
export function generateUniqueFileName(
  basePath: string,
  fileName: string,
  extension: string
): string {
  let fullPath = path.join(basePath, `${fileName}${extension}`);
  let counter = 1;

  while (fs.existsSync(fullPath)) {
    fullPath = path.join(basePath, `${fileName}-${counter}${extension}`);
    counter++;
  }

  return path.basename(fullPath);
}

/**
 * Get relative path from task file to PRD file
 */
export function getRelativePRDPath(taskFilePath: string, prdFilePath: string): string {
  const taskDir = path.dirname(taskFilePath);
  const relative = path.relative(taskDir, prdFilePath);

  // Ensure forward slashes for cross-platform compatibility
  return relative.split(path.sep).join("/");
}

/**
 * Create a file with content, ensuring directory exists
 */
export async function createFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDirectoryExists(dir);
  fs.writeFileSync(filePath, content, "utf-8");
}
