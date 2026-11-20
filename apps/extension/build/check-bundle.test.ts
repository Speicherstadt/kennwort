// @vitest-environment node
/**
 * Review of K-401: the popup bundled @kennwort/ui's Paraglide runtime, which reads and writes
 * localStorage, and the guard over src/ could not see it. The extension now builds with its own
 * runtime (build/paraglide.ts), and every build checks its output (build/check-bundle.ts).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { filesIn, forbiddenInBundle, usesIn } from "./storage-rules.ts";

const extension = join(import.meta.dirname, "..");
const root = join(extension, "..", "..");

describe("the bundle check", () => {
  it.each([
    'localStorage.getItem("PARAGLIDE_LOCALE")',
    "try{e=window.sessionStorage}catch{}",
    'indexedDB.open("k")',
    "e.storage.local.set({k})",
    "chrome?.storage?.sync.get()",
  ])("catches %s", (code) => {
    expect(forbiddenInBundle(code)).not.toEqual([]);
  });

  it.each(["chrome.storage.session.set({k})", "const localized = 1", "e.syncing"])(
    "lets %s pass",
    (code) => {
      expect(forbiddenInBundle(code)).toEqual([]);
    },
  );

  it("catches the localStorage code of the web app's Paraglide runtime", () => {
    const runtime = readFileSync(join(root, "packages/ui/src/paraglide/runtime.js"), "utf8");
    expect(forbiddenInBundle(runtime)).not.toEqual([]);
  });

  it("runs after every build script, for each browser it builds", () => {
    const { scripts } = JSON.parse(readFileSync(join(extension, "package.json"), "utf8"));
    expect(scripts.build).toMatch(/&& bun build\/check-bundle\.ts chrome firefox$/);
    expect(scripts["build:chrome"]).toMatch(/&& bun build\/check-bundle\.ts chrome$/);
    expect(scripts["build:firefox"]).toMatch(/&& bun build\/check-bundle\.ts firefox$/);
  });
});

describe("the built extension", () => {
  it("gets its texts from a Paraglide runtime compiled without localStorage", () => {
    const runtime = readFileSync(join(extension, "paraglide/runtime.js"), "utf8");
    expect(runtime).toContain("const TREE_SHAKE_LOCAL_STORAGE_STRATEGY_USED = false;");
  });

  it("ships no store besides chrome.storage.session, bundled packages included", () => {
    const out = mkdtempSync(join(tmpdir(), "kennwort-extension-build-"));
    try {
      execFileSync("bunx", ["vite", "build", "--outDir", out, "--emptyOutDir"], {
        cwd: extension,
        stdio: "pipe",
      });
      const scripts = filesIn(out, (name) => /\.(js|html)$/.test(name));
      expect(scripts.some((file) => file.includes("popup"))).toBe(true);
      expect(usesIn(scripts, forbiddenInBundle, out)).toEqual([]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
