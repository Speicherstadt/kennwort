/** The workspaces of the monorepo: every folder under packages/ and apps/ with a package.json */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const workspaceDirs = (root: string): string[] =>
  ["packages", "apps"]
    .filter((group) => existsSync(join(root, group)))
    .flatMap((group) => readdirSync(join(root, group)).map((name) => `${group}/${name}`))
    .filter((dir) => existsSync(join(root, dir, "package.json")))
    .sort();

// A string, a line comment, a block comment, or a comma before a closing bracket: matched in one
// pass from the left, so a "//" or ",]" inside a string stays part of the string
const JSONC_TOKENS = /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\/|,(?=\s*[}\]])/g;

/** Reads a tsconfig file, which may carry comments and trailing commas (JSONC) */
export const parseJsonc = (text: string): unknown =>
  JSON.parse(text.replace(JSONC_TOKENS, (_match, string?: string) => string ?? ""));

/** The paths a solution tsconfig references */
export const referencedPaths = (tsconfig: unknown): string[] =>
  ((tsconfig as { references?: { path: string }[] }).references ?? []).map((ref) => ref.path);
