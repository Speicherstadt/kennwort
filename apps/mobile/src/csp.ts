/**
 * Compares the mobile app's CSP with the web app's (K-801): the app shows the same build, so its
 * policy may only be as strict or stricter. Every directive the web policy has must be in the app's
 * policy, and each one may allow only sources the web policy allows for it, plus the few the Tauri
 * shell itself needs (its IPC channel). Errors as values: a list of what is weaker, empty if none.
 */

export type Policy = ReadonlyMap<string, readonly string[]>;

/** "default-src 'none'; script-src 'self'" → directive → sources, names in lower case */
export const parsePolicy = (text: string): Policy =>
  new Map(
    text
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter(([name]) => name !== undefined && name !== "")
      .map(([name, ...sources]) => [(name as string).toLowerCase(), sources] as const),
  );

/** What only the shell may add, by directive: Tauri's IPC (tauri-utils 3.0.0-alpha.4, config.rs) */
export const SHELL_SOURCES: Readonly<Record<string, readonly string[]>> = {
  "connect-src": ["ipc:", "http://ipc.localhost"],
};

/** Keywords that open a policy up whatever the web policy says */
const NEVER = new Set([
  "'unsafe-inline'",
  "'unsafe-eval'",
  "'wasm-unsafe-eval'",
  "*",
  "data:",
  "blob:",
]);

const missing = (web: Policy, app: Policy) =>
  [...web.keys()].filter((name) => !app.has(name)).map((name) => `${name} is missing`);

const extraSources = (web: Policy, app: Policy) =>
  [...app.entries()].flatMap(([name, sources]) => {
    const allowed = new Set([...(web.get(name) ?? []), ...(SHELL_SOURCES[name] ?? [])]);
    return sources
      .filter((source) => NEVER.has(source) || !allowed.has(source))
      .map((source) => `${name} allows ${source}`);
  });

/** Every way the app's policy is weaker than the web's; empty when it is at least as strict */
export const weakerThan = (webPolicy: string, appPolicy: string): string[] => {
  const web = parsePolicy(webPolicy);
  const app = parsePolicy(appPolicy);
  return [...missing(web, app), ...extraSources(web, app)];
};
