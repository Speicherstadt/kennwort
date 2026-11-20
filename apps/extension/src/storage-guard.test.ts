/**
 * Unlocked keys live only in chrome.storage.session (session-keys.ts). The extension writes to no
 * area that reaches the disk, for anything: once such a store exists, a key ends up in it sooner
 * or later (CLAUDE.md, Never; docs/sicherheitsdesign.md, Schlüsselhierarchie). The rules are in
 * build/storage-rules.ts; build/check-bundle.ts applies them to the built code as well.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { filesIn, forbiddenInSource, usesIn } from "../build/storage-rules.ts";

const isSource = (name: string) =>
  /\.(ts|tsx|js|jsx|html)$/.test(name) && !/\.test\.tsx?$/.test(name);

/** What the guard reports for a folder of sources */
const guard = (dir: string) => usesIn(filesIn(dir, isSource), forbiddenInSource, `${dir}/`);

describe("storage guard", () => {
  it("finds no store but chrome.storage.session in the extension's sources", () => {
    const root = join(import.meta.dirname, "..");
    expect(filesIn(import.meta.dirname, isSource).length).toBeGreaterThan(3);
    expect(guard(import.meta.dirname)).toEqual([]);
    expect(usesIn([join(root, "popup.html")], forbiddenInSource)).toEqual([]);
  });

  // Review of K-401: chrome.storage held in a variable slipped past. Planted in a folder of its
  // own, not in src/, so a failing run leaves nothing behind for the other tests to trip over.
  it("fails on a source that reaches local storage through an alias of chrome.storage", () => {
    const dir = mkdtempSync(join(tmpdir(), "kennwort-guard-"));
    try {
      writeFileSync(
        join(dir, "planted.ts"),
        "const areas = chrome.storage;\nexport const keep = (key: number[]) => areas.local.set({ key });\n",
      );
      expect(guard(dir)).not.toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    "await chrome.storage.local.set({ key })",
    "chrome.storage.sync.get('x')",
    "browser.storage.local.get()",
    "chrome?.storage?.local?.set({})",
    "chrome.storage['local'].set({})",
    "const areas = chrome.storage;",
    "areas.local.set({ key })",
    "const s = browser?.storage",
    "use(chrome.storage)",
    "const { local } = chrome.storage;",
    "const { session } = chrome.storage;",
    "const { session, sync: s } = areas;",
    "chrome['storage'].session",
    "x.managed.get()",
    "window.localStorage.setItem('k', v)",
    "globalThis.sessionStorage",
    "indexedDB.open('kennwort')",
    "self.indexeddb",
  ])("catches %s", (source) => {
    expect(forbiddenInSource(source)).not.toEqual([]);
  });

  it.each([
    "chrome.storage.session.set({ key })",
    "const area = chrome?.storage?.session;",
    "(globalThis as { chrome?: { storage?: { session?: SessionArea } } }).chrome?.storage?.session",
    "const localName = 'x';",
    "const synced = true;",
  ])("lets %s pass", (source) => {
    expect(forbiddenInSource(source)).toEqual([]);
  });
});
