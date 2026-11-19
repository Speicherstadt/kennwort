import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import vitestConfig from "../vitest.config.ts";
import { parseJsonc, referencedPaths, workspaceDirs } from "./workspaces.ts";

// CI checks every workspace only if each one takes part in the type check and the test run
const root = join(import.meta.dirname, "..");
const workspaces = workspaceDirs(root);
const projectIncludes = (vitestConfig.test?.projects ?? []).flatMap(
  (project) => (project as { test?: { include?: string[] } }).test?.include ?? [],
);

describe("workspaces", () => {
  it("finds the packages of the monorepo", () => {
    expect(workspaces).toEqual(
      expect.arrayContaining(["packages/crypto", "packages/core", "packages/ui", "apps/web"]),
    );
  });

  it.each(workspaces)("%s is type-checked by tsc -b", (dir) => {
    expect(existsSync(join(root, dir, "tsconfig.json"))).toBe(true);
    const solution = parseJsonc(readFileSync(join(root, "tsconfig.json"), "utf8"));
    expect(referencedPaths(solution)).toContain(dir);
  });

  it.each(workspaces)(
    "%s is covered by a Vitest project or by `bun test` in the root test script",
    (dir) => {
      const rootTest: string = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts
        .test;
      const byVitest = projectIncludes.some((glob) => glob.startsWith(`${dir}/`));
      expect(byVitest || rootTest.includes(`--cwd ${dir} test`)).toBe(true);
    },
  );
});

describe("parseJsonc", () => {
  it("reads line comments and trailing commas", () => {
    expect(parseJsonc('{\n  // note\n  "a": [1, 2,],\n}')).toEqual({ a: [1, 2] });
  });

  it("reads a comment after a value", () => {
    expect(parseJsonc('{\n  "a": 1, // note\n  "b": 2\n}')).toEqual({ a: 1, b: 2 });
  });

  it("reads a block comment", () => {
    expect(parseJsonc('{\n  /* note */\n  "a": 1\n}')).toEqual({ a: 1 });
  });

  it("reads a trailing comma followed by a comment", () => {
    expect(parseJsonc('{\n  "a": 1, // note\n}')).toEqual({ a: 1 });
    expect(parseJsonc('{"a": [1, /* note */]}')).toEqual({ a: [1] });
  });

  it("keeps strings that look like comments or trailing commas", () => {
    expect(parseJsonc('{"a": "x,]", "b": "http://x", "c": "/* y */", "d": "q\\"//"}')).toEqual({
      a: "x,]",
      b: "http://x",
      c: "/* y */",
      d: 'q"//',
    });
  });
});
