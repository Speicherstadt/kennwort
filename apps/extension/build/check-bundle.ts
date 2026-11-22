/**
 * Runs after every build (package.json, "build" and "build:*"): fails when the built extension
 * uses a store besides chrome.storage.session anywhere, including in the code of packages it
 * bundles, which the guard over src/ cannot see, and when a built manifest breaks the rules of its
 * browser (build/manifest-rules.ts, K-407). CI builds in the unit job (`bun run build`) and before
 * the end-to-end tests (playwright.config.ts), so both fail on such a bundle.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BROWSERS, type Browser } from "../src/manifest.ts";
import { manifestProblems } from "./manifest-rules.ts";
import { filesIn, forbiddenInBundle, usesIn } from "./storage-rules.ts";

const dist = join(import.meta.dirname, "..", "dist");
const builds = process.argv.slice(2);

/** The browser a build is for: the end-to-end build is Chrome's with the test hosts */
const browserOf = (build: string): Browser | undefined =>
  build === "e2e" ? "chrome" : BROWSERS.find((browser) => browser === build);

const checkBuild = (build: string): string[] => {
  const dir = join(dist, build);
  const browser = browserOf(build);
  if (!browser) return [`${build}: not a build (${BROWSERS.join(", ")}, e2e)`];
  if (!existsSync(dir)) return [`dist/${build}: missing; build it first`];
  const scripts = filesIn(dir, (name) => /\.(js|mjs|html)$/.test(name));
  if (scripts.length === 0) return [`dist/${build}: no scripts found`];
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  return [
    ...usesIn(scripts, forbiddenInBundle, `${dist}/`),
    ...manifestProblems(browser, manifest, build === "e2e").map(
      (problem) => `dist/${build}/manifest.json: ${problem}`,
    ),
  ];
};

const problems = builds.flatMap(checkBuild);
if (builds.length === 0) problems.push("name the builds to check, e.g. chrome firefox safari");
for (const problem of problems) console.error(problem);
if (problems.length > 0) {
  console.error(
    "The extension may keep data only in chrome.storage.session, and each manifest must suit its browser (docs/extension.md)",
  );
  process.exit(1);
}
