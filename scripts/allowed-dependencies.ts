/**
 * The allowlist of runtime packages (allowed-dependencies.json): every runtime dependency of a
 * workspace needs an entry with a reason that names the workspace, and packages/crypto takes
 * nothing but @noble/* (CLAUDE.md, Never). A dependency is judged by its name, so its version must
 * be an exact registry version: an alias (`npm:`), a Git, file or URL source could install any
 * package under an allowed name (docs/plan.md: dependencies pinned exactly).
 */

type Entry = { reason: string; workspaces: string[] };
/** npm packages, and the Rust crates the mobile app links into its binary (K-801) */
export type Allowlist = { packages: Record<string, Entry>; crates?: Record<string, Entry> };
/** A workspace's runtime dependencies, as a map or as entries when several fields name one package */
export type Workspace = { dir: string; dependencies: Record<string, string> | [string, string][] };

const ONLY_NOBLE = "packages/crypto";
const isWorkspacePackage = (version: string) => version.startsWith("workspace:");
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** What is wrong with one dependency of one workspace, or nothing */
const problemOf = (
  allowlist: Allowlist,
  dir: string,
  [name, version]: [string, string],
): string | undefined => {
  if (!EXACT_VERSION.test(version))
    return `${dir}: ${name}@${version} is not an exact registry version`;
  if (dir === ONLY_NOBLE && !name.startsWith("@noble/"))
    return `${dir}: ${name} is not @noble/*, the only packages allowed in ${ONLY_NOBLE}`;
  const entry = allowlist.packages[name];
  if (!entry) return `${dir}: ${name} is not in allowed-dependencies.json`;
  if (entry.reason.trim() === "")
    return `${dir}: ${name} has no reason in allowed-dependencies.json`;
  if (!entry.workspaces.includes(dir))
    return `${dir}: ${name} is allowed only in ${entry.workspaces.join(", ")}`;
  return undefined;
};

/** Every runtime dependency that the allowlist does not cover */
export const violations = (allowlist: Allowlist, workspaces: Workspace[]): string[] =>
  workspaces.flatMap(({ dir, dependencies }) =>
    (Array.isArray(dependencies) ? dependencies : Object.entries(dependencies))
      .filter(([, version]) => !isWorkspacePackage(version))
      .map((dependency) => problemOf(allowlist, dir, dependency))
      .filter((problem) => problem !== undefined),
  );

/**
 * `overrides` and `resolutions` of the root package.json swap the package behind a name for every
 * workspace, so each one must be an exact registry version too
 */
export const overrideViolations = (root: Record<string, unknown>): string[] =>
  (["overrides", "resolutions"] as const).flatMap((field) =>
    Object.entries((root[field] ?? {}) as Record<string, unknown>)
      .filter(([, version]) => typeof version !== "string" || !EXACT_VERSION.test(version))
      .map(
        ([name, version]) =>
          `package.json: ${field} ${name}@${JSON.stringify(version)} is not an exact registry version`,
      ),
  );

/** A Cargo manifest's runtime dependencies: [build-dependencies] run only while building */
export type Crate = { dir: string; dependencies: Record<string, unknown> };

// Cargo reads a bare version as "this or any compatible later one"; "=" pins it exactly
const EXACT_CRATE_VERSION = /^=\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
/** A crates.io version, or nothing when the source is a repository, a path or another registry */
const crateVersion = (spec: unknown): string | undefined => {
  if (typeof spec === "string") return spec;
  if (typeof spec !== "object" || spec === null) return undefined;
  const fields = spec as Record<string, unknown>;
  if (["git", "path", "registry"].some((source) => source in fields)) return undefined;
  return typeof fields.version === "string" ? fields.version : undefined;
};

const crateProblem = (allowlist: Allowlist, dir: string, name: string, spec: unknown) => {
  const version = crateVersion(spec);
  if (version === undefined || !EXACT_CRATE_VERSION.test(version))
    return `${dir}: crate ${name} is not pinned to an exact crates.io version ("=x.y.z")`;
  const entry = allowlist.crates?.[name];
  if (!entry) return `${dir}: crate ${name} is not in allowed-dependencies.json`;
  if (entry.reason.trim() === "")
    return `${dir}: crate ${name} has no reason in allowed-dependencies.json`;
  if (!entry.workspaces.includes(dir))
    return `${dir}: crate ${name} is allowed only in ${entry.workspaces.join(", ")}`;
  return undefined;
};

/** Every runtime crate that the allowlist does not cover */
export const crateViolations = (allowlist: Allowlist, crates: Crate[]): string[] =>
  crates.flatMap(({ dir, dependencies }) =>
    Object.entries(dependencies)
      .map(([name, spec]) => crateProblem(allowlist, dir, name, spec))
      .filter((problem) => problem !== undefined),
  );
