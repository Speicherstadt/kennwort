/**
 * Runs after every build (package.json, "build" and "build:*"): fails when the built extension
 * uses a store besides chrome.storage.session anywhere, including in the code of packages it
 * bundles, which the guard over src/ cannot see. CI builds in the unit job (`bun run build`) and
 * before the end-to-end tests (playwright.config.ts), so both fail on such a bundle.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { filesIn, forbiddenInBundle, usesIn } from "./storage-rules.ts";

const dist = join(import.meta.dirname, "..", "dist");
const browsers = process.argv.slice(2);

const problems = browsers.flatMap((browser) => {
  const dir = join(dist, browser);
  if (!existsSync(dir)) return [`dist/${browser}: missing; build it first`];
  const scripts = filesIn(dir, (name) => /\.(js|mjs|html)$/.test(name));
  if (scripts.length === 0) return [`dist/${browser}: no scripts found`];
  return usesIn(scripts, forbiddenInBundle, `${dist}/`);
});

if (browsers.length === 0) problems.push("name the builds to check, e.g. chrome firefox");
for (const problem of problems) console.error(problem);
if (problems.length > 0) {
  console.error("The extension may keep data only in chrome.storage.session (docs/extension.md)");
  process.exit(1);
}
