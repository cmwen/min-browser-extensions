import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..", "..");
const previewUrl = pathToFileURL(resolve(root, "tools/pages/screenshot-previews.html")).href;
const outDir = resolve(root, "docs/assets/screenshots");

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  deviceScaleFactor: 1,
  viewport: { height: 920, width: 1540 },
});
const page = await context.newPage();
await page.goto(previewUrl);

await page.locator("#tab-workspace-shot").screenshot({
  path: resolve(outDir, "tab-workspace-manager.png"),
});
await page.locator("#history-insights-shot").screenshot({
  path: resolve(outDir, "history-insights.png"),
});

await browser.close();
