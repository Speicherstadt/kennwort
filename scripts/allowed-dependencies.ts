/**
 * The allowlist of runtime packages (allowed-dependencies.json): every runtime dependency of a
 * workspace needs an entry with a reason that names the workspace, and packages/crypto takes
 * nothing but @noble/* (CLAUDE.md, Never).
 */

export type Allowlist = { packages: Record<string, { reason: string; workspaces: string[] }> };
export type Workspace = { dir: string; dependencies: Record<string, string> };

const ONLY_NOBLE = "packages/crypto";
const isWorkspacePackage = (version: string) => version.startsWith("workspace:");

/** What is wrong with one dependency of one workspace, or nothing */
const problemOf = (allowlist: Allowlist, dir: string, name: string): string | undefined => {
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
      .map(([name]) => problemOf(allowlist, dir, name))
      .filter((problem) => problem !== undefined),
  );
