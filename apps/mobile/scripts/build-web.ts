/**
 * The app's frontend is the web app's own build (K-801): apps/web built in Vite's "mobile" mode
 * into apps/mobile/dist, which tauri.conf.json bundles into the APK and the iOS app. No fork of the
 * UI. The mode only leaves out the service worker: in the app the store's signature covers the
 * bundled files, and nothing is ever loaded from a server as code (docs/handy.md, Updates).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const mobile = join(import.meta.dirname, "..");
const dist = join(mobile, "dist");

const build = Bun.spawnSync(
  ["bunx", "vite", "build", "--mode", "mobile", "--outDir", dist, "--emptyOutDir"],
  { cwd: join(mobile, "../web"), stdout: "inherit", stderr: "inherit" },
);
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);

const index = join(dist, "index.html");
const html = existsSync(index) ? readFileSync(index, "utf8") : undefined;
const problems = [
  ...(html === undefined ? ["dist/index.html is missing"] : []),
  // The release files belong to the web app's signed update (P-16), never to the app
  ...["sw.js", "release.json", "release.sig"]
    .filter((file) => existsSync(join(dist, file)))
    .map((file) => `dist/${file} must not be in the app`),
  ...(html !== undefined && /<script(?![^>]*\bsrc=)[^>]*>/i.test(html)
    ? ["dist/index.html has an inline script"]
    : []),
];
for (const problem of problems) console.error(problem);
process.exit(problems.length > 0 ? 1 : 0);
