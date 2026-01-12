#!/usr/bin/env bun

/**
 * Screenshot Generator for Kaiban Board
 *
 * Generates a screenshot of the kanban board preview for README documentation.
 * Uses Playwright to render the preview HTML and capture it.
 *
 * Usage:
 *   bun run scripts/generate-screenshot.ts
 *
 * Output:
 *   assets/screenshot.png - Dark mode screenshot (1200x700)
 */

import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

interface ScreenshotConfig {
	name: string;
	width: number;
	height: number;
	outputPath: string;
}

const SCREENSHOT_CONFIG: ScreenshotConfig = {
	name: "Kaiban Board Screenshot",
	width: 1200,
	height: 700,
	outputPath: resolve(ROOT_DIR, "assets", "screenshot.png"),
};

async function generateScreenshot(): Promise<void> {
	console.log("🎬 Starting screenshot generation...\n");

	const browser = await chromium.launch({
		headless: true,
	});

	const context = await browser.newContext({
		viewport: {
			width: SCREENSHOT_CONFIG.width,
			height: SCREENSHOT_CONFIG.height,
		},
		deviceScaleFactor: 2, // Retina quality
		colorScheme: "dark",
	});

	const page = await context.newPage();

	// Load the preview HTML file
	const previewPath = resolve(ROOT_DIR, "media", "preview-screenshot.html");
	const fileUrl = `file://${previewPath}`;

	console.log(`📄 Loading preview from: ${previewPath}`);
	await page.goto(fileUrl, { waitUntil: "networkidle" });

	// Wait for any animations to complete
	await page.waitForTimeout(500);

	// Take the screenshot
	console.log(`📸 Capturing screenshot: ${SCREENSHOT_CONFIG.name}`);
	await page.screenshot({
		path: SCREENSHOT_CONFIG.outputPath,
		type: "png",
		animations: "disabled",
	});

	console.log(`✅ Screenshot saved to: ${SCREENSHOT_CONFIG.outputPath}`);

	await browser.close();

	console.log("\n🎉 Screenshot generation complete!");
}

// Run the script
generateScreenshot().catch((error) => {
	console.error("❌ Screenshot generation failed:", error);
	process.exit(1);
});
