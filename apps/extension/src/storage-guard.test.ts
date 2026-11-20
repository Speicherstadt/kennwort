/**
 * Unlocked keys live only in chrome.storage.session (session-keys.ts). The extension writes to no
 * area that reaches the disk, for anything: once such a store exists, a key ends up in it sooner
 * or later (CLAUDE.md, Never; docs/sicherheitsdesign.md, Schlüsselhierarchie).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN: [string, RegExp][] = [
  ["chrome.storage.local / sync", /\bstorage\s*(\??\.)\s*(local|sync|managed)\b/],
  ['storage["local"]', /\bstorage\s*(\?\.)?\s*\[\s*["'`](local|sync|managed)["'`]\s*\]/],
  ["{ local } = chrome.storage", /\{[^}]*\b(local|sync|managed)\b[^}]*\}\s*=\s*[\w.?]*storage\b/],
  ["localStorage / sessionStorage", /\b(local|session)Storage\b/],
  ["indexedDB", /\bindexedDB\b/i],
];

/** The names of the forbidden stores a source text uses */
const forbiddenStores = (source: string): string[] =>
  FORBIDDEN.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|html)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });

describe("storage guard", () => {
  it("finds no store but chrome.storage.session in the extension's sources", () => {
    const root = join(import.meta.dirname, "..");
    const files = [...sourceFiles(import.meta.dirname), join(root, "popup.html")];
    const uses = files.flatMap((file) =>
      forbiddenStores(readFileSync(file, "utf8")).map((name) => `${relative(root, file)}: ${name}`),
    );
    expect(files.length).toBeGreaterThan(3);
    expect(uses).toEqual([]);
  });

  it.each([
    "await chrome.storage.local.set({ key })",
    "chrome.storage.sync.get('x')",
    "browser.storage.local.get()",
    "chrome?.storage?.local?.set({})",
    "chrome.storage['local'].set({})",
    "const { local } = chrome.storage;",
    "const { session, sync: s } = browser.storage;",
    "window.localStorage.setItem('k', v)",
    "globalThis.sessionStorage",
    "indexedDB.open('kennwort')",
    "self.indexeddb",
  ])("catches %s", (source) => {
    expect(forbiddenStores(source)).not.toEqual([]);
  });

  it.each([
    "chrome.storage.session.set({ key })",
    "const area = chrome?.storage?.session;",
    "const { session } = chrome.storage;",
    "const localName = 'x';",
  ])("lets %s pass", (source) => {
    expect(forbiddenStores(source)).toEqual([]);
  });
});
