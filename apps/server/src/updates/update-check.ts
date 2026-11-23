/**
 * The update notice (K-703): a while after the start and then once a day the server asks which
 * release is the newest (releases.ts). Is it newer than this server, every owner and admin of each
 * company on it gets one notification "update-available" (K-602, bell and push), once per release:
 * the version last announced stays in server_keys, so a restart repeats nothing. The operator
 * turns it off with KENNWORT_UPDATE_CHECK=false; then the server never asks.
 */
import { eq } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { companies, serverKeys } from "../db/schema.ts";
import type { Notify } from "../notifications/notify.ts";
import { companyAccounts } from "../notifications/recipients.ts";
import { formatVersion, isNewer, parseVersion, type Version } from "./releases.ts";

/** Not at the very start: a server restarted in a loop asks no more than once in a while */
export const FIRST_CHECK_MS = 10 * 60 * 1000;
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const ANNOUNCED = "update-announced";

export type UpdateCheckDeps = {
  db: Db;
  notify: Notify;
  now: () => number;
  /** This server's version, X.Y.Z */
  current: string;
  /** The newest release, as releases.ts asks for it; only tests pass another */
  latest: () => Promise<Version | undefined>;
};

const announced = (db: Db) =>
  db.select().from(serverKeys).where(eq(serverKeys.name, ANNOUNCED)).get()?.value;

const remember = (db: Db, version: string, at: number) =>
  db
    .insert(serverKeys)
    .values({ name: ANNOUNCED, value: version, createdAt: at })
    .onConflictDoUpdate({ target: serverKeys.name, set: { value: version, createdAt: at } })
    .run();

/** One check; gives the version it announced, if any */
export const checkForUpdate = async (deps: UpdateCheckDeps) => {
  const current = parseVersion(deps.current);
  const latest = await deps.latest();
  if (!current || !latest || !isNewer(latest, current)) return undefined;
  const version = formatVersion(latest);
  const before = parseVersion(announced(deps.db) ?? "");
  if (before && !isNewer(latest, before)) return undefined;
  remember(deps.db, version, deps.now());
  for (const { id } of deps.db.select({ id: companies.id }).from(companies).all())
    deps.notify({
      companyId: id,
      recipients: companyAccounts(deps.db, id, ["owner", "admin"]),
      kind: "update-available",
    });
  return version;
};

export type Timers = {
  after: (ms: number, run: () => void) => void;
  every: (ms: number, run: () => void) => void;
};

/** Timers that do not keep the process alive on their own */
export const realTimers: Timers = {
  after: (ms, run) => void setTimeout(run, ms).unref(),
  every: (ms, run) => void setInterval(run, ms).unref(),
};

export const startUpdateCheck = (deps: UpdateCheckDeps, timers: Timers = realTimers) => {
  const check = () => void checkForUpdate(deps).catch(() => undefined);
  timers.after(FIRST_CHECK_MS, () => {
    check();
    timers.every(CHECK_EVERY_MS, check);
  });
};
