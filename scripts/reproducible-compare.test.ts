import { describe, expect, it } from "vitest";
import {
  BUILD_OUTPUTS,
  describeDifferences,
  differences,
  firstDifferentLine,
  missingOutputs,
  parseArgs,
  releaseDifferences,
  type Snapshot,
} from "./reproducible-compare.ts";

const snapshot = (files: Record<string, string | { hash: string; text: string }>): Snapshot =>
  new Map(
    Object.entries(files).map(([path, file]) => [
      path,
      typeof file === "string" ? { hash: file } : file,
    ]),
  );

describe("the outputs of `bun run build` (K-408)", () => {
  it("cover the web app, the extension for every browser and the server", () => {
    expect(BUILD_OUTPUTS).toEqual([
      "apps/web/dist",
      "apps/extension/dist/chrome",
      "apps/extension/dist/firefox",
      "apps/extension/dist/safari",
      "apps/server/dist",
    ]);
  });

  it("names an output a build left missing", () => {
    const built = new Set(["apps/web/dist", "apps/server/dist"]);
    expect(missingOutputs(BUILD_OUTPUTS, (path) => built.has(path))).toEqual([
      "apps/extension/dist/chrome",
      "apps/extension/dist/firefox",
      "apps/extension/dist/safari",
    ]);
  });
});

describe("differences between two builds", () => {
  it("finds none in identical builds", () => {
    const files = { "apps/web/dist/index.html": "aa", "apps/web/dist/sw.js": "bb" };
    expect(differences(snapshot(files), snapshot(files))).toEqual([]);
  });

  it("lists changed, missing and extra files, sorted by path", () => {
    const first = snapshot({ "b/changed": "11", "a/only-first": "22", same: "33" });
    const second = snapshot({ "b/changed": "12", "c/only-second": "44", same: "33" });
    expect(differences(first, second)).toEqual([
      { kind: "only-first", path: "a/only-first" },
      { kind: "changed", path: "b/changed" },
      { kind: "only-second", path: "c/only-second" },
    ]);
  });

  it("points to the first line that differs in a text file", () => {
    const first = snapshot({ "release.json": { hash: "1", text: '{\n  "sequence": 1\n}\n' } });
    const second = snapshot({ "release.json": { hash: "2", text: '{\n  "sequence": 2\n}\n' } });
    expect(differences(first, second)).toEqual([
      {
        kind: "changed",
        path: "release.json",
        line: { number: 2, first: '  "sequence": 1', second: '  "sequence": 2' },
      },
    ]);
  });

  it("finds the line after the shorter text's end", () => {
    expect(firstDifferentLine("a\nb", "a\nb\nc")).toEqual({ number: 3, first: "", second: "c" });
    expect(firstDifferentLine("a\nb\nc", "a\nb")).toEqual({ number: 3, first: "c", second: "" });
  });

  it("reads as a report that names every file and shortens long lines", () => {
    const long = "x".repeat(400);
    const report = describeDifferences([
      { kind: "changed", path: "apps/server/dist/kennwort-server" },
      { kind: "changed", path: "a.js", line: { number: 1, first: long, second: "y" } },
      { kind: "only-first", path: "gone.txt" },
      { kind: "only-second", path: "new.txt" },
    ]);
    expect(report.split("\n")).toEqual([
      "4 file(s) differ between the first build and the second build:",
      "  apps/server/dist/kennwort-server: different bytes",
      "  a.js: differs from line 1",
      `    the first build: ${"x".repeat(160)}…`,
      "    the second build: y",
      "  gone.txt: only in the first build",
      "  new.txt: only in the second build",
    ]);
  });
});

describe("a rebuild against a published release.json (P-16)", () => {
  const release = (version: string, files: Record<string, string>, sequence = 1) => ({
    format: 1,
    version,
    sequence,
    files,
  });

  it("matches when the version and every hash match, whatever sequence or key", () => {
    const published = release("0123456789abcdef", { "/index.html": "aa" }, 1763800000);
    const built = release("0123456789abcdef", { "/index.html": "aa" }, 5);
    expect(releaseDifferences(published, built)).toEqual({ ok: true, value: [] });
  });

  it("names a file with another hash, a missing one and another version", () => {
    const published = release("0123456789abcdef", { "/index.html": "aa", "/a.js": "bb" });
    const built = release("fedcba9876543210", { "/index.html": "ab" });
    expect(releaseDifferences(published, built)).toEqual({
      ok: true,
      value: [
        {
          kind: "changed",
          path: "version",
          line: { number: 1, first: "0123456789abcdef", second: "fedcba9876543210" },
        },
        { kind: "only-first", path: "/a.js" },
        { kind: "changed", path: "/index.html" },
      ],
    });
  });

  it("refuses something that is not a release.json", () => {
    expect(releaseDifferences({ files: {} }, release("a", {})).ok).toBe(false);
    expect(releaseDifferences(null, release("a", {})).ok).toBe(false);
    expect(releaseDifferences(release("a", { "/x": 1 as unknown as string }), {}).ok).toBe(false);
    expect(releaseDifferences(release("a", {}), "nope").ok).toBe(false);
  });
});

describe("the command line of `bun run reproducible`", () => {
  it("builds twice by default, reuses a build with --reuse, compares with --release", () => {
    expect(parseArgs([])).toEqual({ ok: true, value: { reuse: false } });
    expect(parseArgs(["--reuse"])).toEqual({ ok: true, value: { reuse: true } });
    expect(parseArgs(["--release", "release.json"])).toEqual({
      ok: true,
      value: { reuse: false, release: "release.json" },
    });
  });

  it("refuses an unknown flag and --release without a file", () => {
    expect(parseArgs(["--fast"]).ok).toBe(false);
    expect(parseArgs(["--release"]).ok).toBe(false);
  });
});
