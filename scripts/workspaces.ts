/** The workspaces of the monorepo: every folder under packages/ and apps/ with a package.json */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const workspaceDirs = (root: string): string[] =>
  ["packages", "apps"]
    .filter((group) => existsSync(join(root, group)))
    .flatMap((group) => readdirSync(join(root, group)).map((name) => `${group}/${name}`))
    .filter((dir) => existsSync(join(root, dir, "package.json")))
    .sort();

/** Reads a tsconfig file, which may carry line comments */
export const parseJsonc = (text: string): unknown =>
  JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));

/** The paths a solution tsconfig references */
export const referencedPaths = (tsconfig: unknown): string[] =>
  ((tsconfig as { references?: { path: string }[] }).references ?? []).map((ref) => ref.path);
