/**
 * Renders the PNG icons of the web app manifest from their SVG sources in public/icons, once after
 * the logo changes; the PNGs are committed, so the build needs no browser.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium bun scripts/render-icons.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const icons = join(import.meta.dirname, "../public/icons");
const renders = [
  { source: "icon.svg", size: 192, out: "icon-192.png" },
  { source: "icon.svg", size: 512, out: "icon-512.png" },
  // iOS rounds the corners itself and fills transparent ones black: the full surface fits better
  { source: "icon-maskable.svg", size: 180, out: "apple-touch-icon.png" },
  { source: "icon-maskable.svg", size: 512, out: "icon-maskable-512.png" },
];

const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
for (const { source, size, out } of renders) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(join(icons, source), "utf8");
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: join(icons, out), omitBackground: true });
  await page.close();
}
await browser.close();
