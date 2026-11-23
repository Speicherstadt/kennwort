/**
 * What the server binary does besides serving (K-703): `health` for the container's healthcheck
 * (the image has no shell and no curl), `backup <file>` while the server runs, `restore <file>`
 * while it is stopped. Each reads only the settings it needs, so a backup needs no auth secret.
 */
import { z } from "zod";
import type { Log } from "../log.ts";
import { backupDatabase } from "./backup.ts";
import { restoreDatabase } from "./restore.ts";

export type Command =
  | { kind: "serve" }
  | { kind: "health" }
  | { kind: "backup"; file: string }
  | { kind: "restore"; file: string }
  | { kind: "usage" };

export const parseCommand = (args: readonly string[]): Command => {
  const [name, file, ...rest] = args;
  if (name === undefined) return { kind: "serve" };
  if (name === "health" && file === undefined) return { kind: "health" };
  if ((name === "backup" || name === "restore") && file && rest.length === 0)
    return { kind: name, file };
  return { kind: "usage" };
};

// The same defaults as config.ts, without the settings serving needs
const Settings = z.object({
  KENNWORT_PORT: z
    .string()
    .regex(/^\d{1,5}$/)
    .default("8100"),
  KENNWORT_DATABASE: z.string().min(1).default("data/kennwort.db"),
});

export type OperationDeps = {
  env: Record<string, string | undefined>;
  log: Log;
  fetch: (url: string) => Promise<Response>;
  now: () => number;
};

const HEALTH_TIMEOUT_MS = 3000;

/** 0 when the server on this machine answers /health with its database ok */
const health = async (port: string, deps: OperationDeps) => {
  const answer = await Promise.race([
    deps.fetch(`http://127.0.0.1:${port}/health`).catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(resolve, HEALTH_TIMEOUT_MS)),
  ]);
  return answer?.ok ? 0 : 1;
};

/** The exit code, or undefined when the server is to start */
export const runCommand = async (
  command: Command,
  deps: OperationDeps,
): Promise<number | undefined> => {
  if (command.kind === "serve") return undefined;
  const settings = Settings.safeParse(deps.env);
  if (command.kind === "usage" || !settings.success) {
    deps.log("error", "usage: kennwort-server [health | backup <file> | restore <file>]");
    return 2;
  }
  const { KENNWORT_PORT: port, KENNWORT_DATABASE: database } = settings.data;
  if (command.kind === "health") return health(port, deps);
  if (command.kind === "backup") {
    const result = backupDatabase(database, command.file);
    if (!result.ok) deps.log("error", "backup failed", { reason: result.error });
    else deps.log("info", "backup written", { file: command.file, bytes: result.value.bytes });
    return result.ok ? 0 : 1;
  }
  const result = restoreDatabase(command.file, database, { now: deps.now });
  if (!result.ok) deps.log("error", "restore failed", { reason: result.error });
  else deps.log("info", "backup restored", { database, replaced: result.value.replaced });
  return result.ok ? 0 : 1;
};
