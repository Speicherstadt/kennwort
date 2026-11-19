/** `bun run lint`: fails when a workspace has a runtime dependency allowed-dependencies.json does not cover */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Allowlist, violations, type Workspace } from "./allowed-dependencies.ts";
import { workspaceDirs } from "./workspaces.ts";

const root = process.cwd();
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(root, path), "utf8"));

const workspaces: Workspace[] = workspaceDirs(root).map((dir) => ({
  dir,
  dependencies:
    (readJson(`${dir}/package.json`) as { dependencies?: Record<string, string> }).dependencies ??
    {},
}));
const problems = violations(readJson("allowed-dependencies.json") as Allowlist, workspaces);
for (const problem of problems) console.error(problem);
process.exit(problems.length > 0 ? 1 : 0);
