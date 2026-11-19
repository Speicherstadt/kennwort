/**
 * The allowlist of runtime packages (allowed-dependencies.json): every runtime dependency of a
 * workspace needs an entry with a reason that names the workspace, and packages/crypto takes
 * nothing but @noble/* (CLAUDE.md, Never). A dependency is judged by its name, so its version must
 * be an exact registry version: an alias (`npm:`), a Git, file or URL source could install any
 * package under an allowed name (docs/plan.md: dependencies pinned exactly).
 */

export type Allowlist = { packages: Record<string, { reason: string; workspaces: string[] }> };
export type Workspace = { dir: string; dependencies: Record<string, string> };

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
    Object.entries(dependencies)
      .filter(([, version]) => !isWorkspacePackage(version))
      .map((dependency) => problemOf(allowlist, dir, dependency))
      .filter((problem) => problem !== undefined),
  );
