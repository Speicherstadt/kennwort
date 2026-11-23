/** `bun run lint`: fails when a workspace has a runtime dependency allowed-dependencies.json does not cover */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Allowlist,
  type Crate,
  crateViolations,
  type LockedCrate,
  lockViolations,
  manifestCrates,
  overrideViolations,
  violations,
  type Workspace,
} from "./allowed-dependencies.ts";
import { workspaceDirs } from "./workspaces.ts";

const root = process.cwd();
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(root, path), "utf8"));

// Every kind of dependency Bun installs for a workspace ends up beside its code
const RUNTIME_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"] as const;
type Manifest = Partial<Record<(typeof RUNTIME_FIELDS)[number], Record<string, string>>>;

const workspaces: Workspace[] = workspaceDirs(root).map((dir) => {
  const manifest = readJson(`${dir}/package.json`) as Manifest;
  return {
    dir,
    // Entries, not a merged map: each field must pass on its own
    dependencies: RUNTIME_FIELDS.flatMap((field) => Object.entries(manifest[field] ?? {})),
  };
});
// A workspace with a Tauri shell links Rust crates into the app: they are runtime code as well
const TAURI_MANIFEST = "/src-tauri/Cargo.toml";
const crates: Crate[] = workspaceDirs(root)
  .filter((dir) => existsSync(join(root, dir + TAURI_MANIFEST)))
  .map((dir) => {
    const manifest = Bun.TOML.parse(readFileSync(join(root, dir + TAURI_MANIFEST), "utf8"));
    return { dir, dependencies: manifestCrates(manifest as Record<string, unknown>) };
  });
const allowlist = readJson("allowed-dependencies.json") as Allowlist;
// And every crate the build resolved, from the lockfile beside the manifest (K-802)
const TAURI_LOCK = "/src-tauri/Cargo.lock";
const lockProblems = crates.flatMap(({ dir }) => {
  const lock = Bun.TOML.parse(readFileSync(join(root, dir + TAURI_LOCK), "utf8")) as {
    package?: LockedCrate[];
  };
  return lockViolations(allowlist, dir, lock.package ?? []);
});
const problems = [
  ...lockProblems,
  ...violations(allowlist, workspaces),
  ...crateViolations(allowlist, crates),
  ...overrideViolations(readJson("package.json") as Record<string, unknown>),
];
for (const problem of problems) console.error(problem);
process.exit(problems.length > 0 ? 1 : 0);
