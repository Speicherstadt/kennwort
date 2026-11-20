/**
 * What the extension may not use: any store but chrome.storage.session, where a key could reach
 * the disk (CLAUDE.md, Never; docs/sicherheitsdesign.md, Schlüsselhierarchie). Read by the guard
 * over the sources (src/storage-guard.test.ts) and by the check over the built bundle
 * (build/check-bundle.ts). Kept outside src/, which the guard scans, since it names them all.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const AREA = "(local|sync|managed)";

const SOURCE_RULES: [string, RegExp][] = [
  // On any value: an alias of chrome.storage or a renamed namespace reaches the area this way too
  ["storage area local / sync / managed", new RegExp(String.raw`(\?\.|\.)\s*${AREA}\b`)],
  ['["local"] / ["sync"] / ["managed"]', new RegExp(String.raw`\[\s*["'\`]${AREA}["'\`]\s*\]`)],
  ["{ local } = …", new RegExp(String.raw`\{[^}]*\b${AREA}\b[^}]*\}\s*=`)],
  // The namespace itself is only ever followed by .session: never held, passed or destructured
  [
    "chrome.storage without .session",
    /\b(chrome|browser)\s*(\?\.|\.)\s*storage\b(?!\s*(\?\.|\.)\s*session\b)/,
  ],
  ["chrome[…] / browser[…]", /\b(chrome|browser)\s*(\?\.)?\s*\[/],
  ["localStorage / sessionStorage", /\b(local|session)Storage\b/],
  ["indexedDB", /\bindexedDB\b/i],
];

/** The names of the forbidden stores a source text uses */
export const forbiddenInSource = (source: string): string[] =>
  SOURCE_RULES.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);

// Minified code renames variables but not globals or property names; anything that only names a
// store in a string or comment fails too, which keeps the rule simple and errs on the safe side
const BUNDLE_RULE =
  /\b(localStorage|sessionStorage|indexedDB)\b|\bstorage\s*(\?\.|\.)\s*(local|sync|managed)\b/g;

/** Each use of a forbidden store in built code */
export const forbiddenInBundle = (code: string): string[] =>
  [...code.matchAll(BUNDLE_RULE)].map((match) => match[0]);

/** The files under a folder, recursively, that a predicate selects */
export const filesIn = (dir: string, select: (name: string) => boolean): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(path, select);
    return select(entry.name) ? [path] : [];
  });

/** `file: rule` for each forbidden use in the given files */
export const usesIn = (files: string[], rules: (text: string) => string[], base = ""): string[] =>
  files.flatMap((file) =>
    rules(readFileSync(file, "utf8")).map((name) => `${file.slice(base.length)}: ${name}`),
  );
