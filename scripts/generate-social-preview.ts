#!/usr/bin/env bun

/**
 * Social Preview Generator for Kaiban Board
 *
 * Generates a GitHub-style social preview image (1280x640) for the repository.
 * Uses Playwright to render the preview HTML and capture it.
 *
 * Usage:
 *   bun run scripts/generate-social-preview.ts
 *
 * Output:
 *   assets/social-preview.png - GitHub social preview (1280x640)
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

interface ScreenshotConfig {
  name: string;
  width: number;
  height: number;
  outputPath: string;
}

const CONFIG: ScreenshotConfig = {
  name: "Kaiban Board Social Preview",
  width: 1280,
  height: 640,
  outputPath: resolve(ROOT_DIR, "assets", "social-preview.png"),
};

async function generateSocialPreview(): Promise<void> {
  console.log("🎬 Generating social preview...\n");

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: {
      width: CONFIG.width,
      height: CONFIG.height,
    },
    deviceScaleFactor: 2, // Retina quality
    colorScheme: "dark",
  });

  const page = await context.newPage();

  const previewPath = resolve(ROOT_DIR, "assets", "social-preview-template.html");
  const fileUrl = `file://${previewPath}`;

  console.log(`📄 Loading template from: ${previewPath}`);
  await page.goto(fileUrl, { waitUntil: "networkidle" });

  // Wait for fonts to load
  await page.waitForTimeout(1000);

  console.log(`📸 Capturing: ${CONFIG.name}`);
  await page.screenshot({
    path: CONFIG.outputPath,
    type: "png",
    animations: "disabled",
  });

  console.log(`✅ Saved to: ${CONFIG.outputPath}`);

  await browser.close();

  console.log("\n🎉 Social preview generated!");
}

generateSocialPreview().catch((error) => {
  console.error("❌ Generation failed:", error);
  process.exit(1);
});
