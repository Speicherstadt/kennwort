/**
 * The entries of every vault this account opened (K-306, P-09, P-21): each vault has its device
 * state in memory; loading pulls and checks every record against the vault's checked log, a change
 * goes into the device's queue and is synced as the next version. Unlocked content lives only in
 * memory. With the offline copy (K-308 part b) every record that passed the checks is kept there as
 * the server sent it, still sealed; a vault opened anew first pulls from the copy, so offline the
 * entries are there, and online the server is checked against what this device saw (E-13, E-15).
 * After someone left (K-307, P-11) every write knows who left and marks what they could read, no
 * write goes out while a rotation is due, and a manager's rotation writes every entry anew.
 */
import {
  type Connection,
  type Device,
  type EntryRecord,
  emptyDevice,
  encodeBytes,
  httpServer,
  idKey,
  openRecordWithKey,
  type Pulled,
  pastExposures,
  pull,
  type Refused,
  type SyncContext,
  type SyncServer,
  sync,
  type Trust,
} from "@kennwort/core";
import { createSignal } from "solid-js";
import type { OpenAccount } from "../session/open-account.ts";
import type { Vault } from "../vaults/vaults.ts";
import { withPulled, withSynced } from "./device-merge.ts";
import type { StoredEntry } from "./entries.ts";
import { entryImport } from "./entry-import.ts";
import { entryResave } from "./entry-resave.ts";
import { entryRotation } from "./entry-rotation.ts";
import { entryWrites } from "./entry-writes.ts";

export type ServerFor = (token: string, vaultId: Uint8Array) => SyncServer;

/** The sync server of the app: same origin, the session's token */
export const httpServerFor =
  (send: typeof fetch = fetch): ServerFor =>
  (token, vaultId) => {
    const connection: Connection = { fetch: send, baseUrl: "", token };
    return httpServer(connection, vaultId);
  };

export type VaultState = { vault: Vault; device: Device; refused: Refused[] };
/** rotation-due: someone left and the vault key is not rotated yet, so nothing is written (P-11) */
export type SaveError = "locked" | "read-only" | "unreachable" | "not-saved" | "rotation-due";
/** Queues a change to one entry and syncs it at once; gives the device as the sync left it */
export type SyncChange = (
  vaultIdText: string,
  entryId: Uint8Array,
  change: (device: Device) => Device,
) => Promise<{ ok: true; value: Device } | { ok: false; error: SaveError }>;
/** Queues a change to several entries in one sync; gives the device and the entries still queued */
export type SyncEntries = (
  vaultIdText: string,
  entryIds: readonly Uint8Array[],
  change: (device: Device) => Device,
) => Promise<
  { ok: true; value: { device: Device; unsaved: Uint8Array[] } } | { ok: false; error: SaveError }
>;

/**
 * What the store uses of an offline copy: the web app's (apps/web/src/offline/local-copy.ts) keeps
 * it in IndexedDB; the extension, which may keep nothing on the disk, passes none
 */
export type EntryCopy = {
  records: (vaultIdText: string) => Promise<EntryRecord[]>;
  keepRecords: (
    vaultIdText: string,
    records: EntryRecord[],
    check: (record: EntryRecord) => boolean,
  ) => Promise<unknown>;
};

/** What the store needs of the open account */
type Session = Pick<OpenAccount, "opened">;

/** The copy as a server to pull from: the same checks as for the real one, and no writes */
const copyServer = (copy: EntryCopy, vaultIdText: string): SyncServer => ({
  pull: () => copy.records(vaultIdText),
  push: async () => {
    throw new Error("the offline copy takes no writes"); // i18n-ignore: never shown
  },
});

/**
 * The server with the copy behind it: every record it pulls and every record it took is offered to
 * the copy, which keeps it only if it opens under the vault's checked log (P-09)
 */
const keeping = (server: SyncServer, keep: (records: EntryRecord[]) => void): SyncServer => ({
  ...(server.versions && { versions: server.versions }),
  pull: async () => {
    const records = await server.pull();
    keep(records);
    return records;
  },
  push: async (record) => {
    const result = await server.push(record);
    if (result.ok) keep([record]);
    return result;
  },
});

/** The vault's server for one operation under ctx; offline the token is empty and it fails */
const serversOf =
  (serverFor: ServerFor, session: Session, copy: EntryCopy | undefined) =>
  (vault: Vault, ctx: SyncContext) => {
    const opened = session.opened();
    if (!opened) return undefined;
    const server = serverFor(opened.token, vault.ring.vaultId);
    if (!copy) return server;
    // Under the key of the record's own epoch: one a rotation has not re-encrypted yet stays too
    const check = (record: EntryRecord) => {
      const ring = [ctx.ring, ...(ctx.older ?? [])].find((r) => r.epoch === record.epoch);
      return ring !== undefined && openRecordWithKey(record, ring, ctx.log, ctx.trust, 0).ok;
    };
    return keeping(server, (records) => void copy.keepRecords(vault.idText, records, check));
  };

const contextOf = (session: Session, vault: Vault, trust: Trust): SyncContext | undefined => {
  const opened = session.opened();
  if (!opened) return undefined;
  const now = Math.floor(Date.now() / 1000);
  return {
    author: { id: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey },
    ring: vault.ring,
    older: vault.older,
    log: vault.log,
    trust: { ...trust, now },
    lastSeen: vault.log.hash,
    now,
    exposures: pastExposures(vault.entries),
  };
};

/** Syncs the device a change makes of the vault's state; why not, or what was sent and came back */
export type SyncDevice = (
  state: VaultState,
  change: (device: Device) => Device,
) => Promise<"locked" | "unreachable" | { queued: Device; synced: Pulled }>;

/** Pulling and syncing one vault under its context as things are now; nothing while locked */
const vaultSync = (deps: {
  trust: () => Trust | undefined;
  session: Session;
  serverOf: ReturnType<typeof serversOf>;
  update: (vaultIdText: string, change: (state: VaultState) => VaultState) => void;
}) => {
  const { session, serverOf, update } = deps;
  /** The vault's sync context and server as things are now; nothing while locked */
  const openOf = (state: VaultState) => {
    const trust = deps.trust();
    const ctx = trust && contextOf(session, state.vault, trust);
    const server = ctx && serverOf(state.vault, ctx);
    return ctx && server ? { ctx, server } : undefined;
  };

  /** Pulls a vault anew into its device as it is now; nothing while locked or unanswered */
  const pullNow = async (state: VaultState) => {
    const open = openOf(state);
    const pulled = open && (await pull(state.device, open.server, open.ctx).catch(() => undefined));
    if (!pulled) return undefined;
    update(state.vault.idText, (s) => ({
      ...s,
      device: withPulled(s.device, pulled.device),
      refused: pulled.refused,
    }));
    return pulled;
  };

  /** Syncs the device a change makes of the vault's state, and keeps what the sync left */
  const syncDevice: SyncDevice = async (state, change) => {
    const open = openOf(state);
    if (!open) return "locked";
    const { ctx, server } = open;
    const queued = change(state.device);
    // The very device that is sent: withSynced knows the ops it took by their identity
    update(state.vault.idText, (s) => ({ ...s, device: queued }));
    const synced = await sync(queued, server, ctx).catch(() => undefined);
    if (!synced) return "unreachable";
    update(state.vault.idText, (s) => ({
      ...s,
      device: withSynced(s.device, queued, synced.device, ctx.now),
    }));
    return { queued, synced };
  };
  return { pullNow, syncDevice, serverNow: openOf };
};

/** Syncing queued changes of one or more entries, refused in a vault nobody may write in now */
const entrySyncs = (deps: {
  current: (vaultIdText: string) => VaultState | undefined;
  trust: () => Trust | undefined;
  syncDevice: SyncDevice;
}) => {
  const { current, syncDevice } = deps;
  /** Queues a change to entries and syncs it at once; what the server did not take stays queued */
  const syncEntries: SyncEntries = async (vaultIdText, entryIds, change) => {
    const state = current(vaultIdText);
    if (!state || !deps.trust()) return { ok: false, error: "unreachable" };
    if (state.vault.role === "read") return { ok: false, error: "read-only" };
    // Not even queued: whoever left still holds the current key until a manager rotates it
    if (state.vault.log.rotationDue) return { ok: false, error: "rotation-due" };
    const done = await syncDevice(state, change);
    if (typeof done === "string") return { ok: false, error: done };
    const { device } = done.synced;
    const queued = new Set(device.queue.map((op) => idKey(op.entryId)));
    return { ok: true, value: { device, unsaved: entryIds.filter((id) => queued.has(idKey(id))) } };
  };

  /** Queues a change to one entry and syncs it at once; it stays queued if the server failed */
  const syncChange: SyncChange = async (vaultIdText, entryId, change) => {
    const done = await syncEntries(vaultIdText, [entryId], change);
    if (!done.ok) return done;
    const { device, unsaved } = done.value;
    return unsaved.length > 0 ? { ok: false, error: "not-saved" } : { ok: true, value: device };
  };

  return { syncEntries, syncChange };
};

export const createEntryStore = (serverFor: ServerFor, session: Session, copy?: EntryCopy) => {
  const [states, setStates] = createSignal<VaultState[]>([]);
  let trust: Trust | undefined;
  /** Only the newest load writes: an older one that ends later would bring back old vaults */
  let generation = 0;
  const serverOf = serversOf(serverFor, session, copy);
  /** Changes one vault's state as it is now, never a copy read before an await */
  // A plain mirror of the signal: Solid 2 hands back the old value until the next flush, and a
  // save or a pull must build on the state as it is right now
  let all: VaultState[] = [];
  const write = (next: VaultState[]) => {
    all = next;
    setStates(next);
  };
  const update = (vaultIdText: string, change: (state: VaultState) => VaultState) =>
    write(all.map((s) => (s.vault.idText === vaultIdText ? change(s) : s)));
  const current = (vaultIdText: string) => all.find((s) => s.vault.idText === vaultIdText);

  /** Pulls every vault anew; a vault that does not answer keeps what it had */
  const load = async (vaults: Vault[], checkedBy: Trust) => {
    const mine = ++generation;
    trust = checkedBy;
    const before = new Map(all.map((s) => [s.vault.idText, s]));
    // Known at once, so a change made while the vaults still pull has a vault to go to
    write(
      vaults.map((vault) => ({
        vault,
        device: before.get(vault.idText)?.device ?? emptyDevice(),
        refused: before.get(vault.idText)?.refused ?? [],
      })),
    );
    await Promise.all(
      vaults.map(async (vault) => {
        if (copy && !before.has(vault.idText))
          await pullFrom(vault, checkedBy, mine, () => copyServer(copy, vault.idText));
        await pullFrom(vault, checkedBy, mine, (ctx) => serverOf(vault, ctx));
      }),
    );
  };

  /** One pull of a vault; what refuses is what this pull refused, from the copy or the server */
  const pullFrom = async (
    vault: Vault,
    checkedBy: Trust,
    mine: number,
    source: (ctx: SyncContext) => SyncServer | undefined,
  ) => {
    const ctx = contextOf(session, vault, checkedBy);
    const server = ctx && source(ctx);
    const start = current(vault.idText)?.device;
    if (!ctx || !server || !start) return;
    const pulled = await pull(start, server, ctx).catch(() => undefined);
    if (!pulled || mine !== generation) return;
    update(vault.idText, (s) => ({
      ...s,
      device: withPulled(s.device, pulled.device),
      refused: pulled.refused,
    }));
  };

  const { pullNow, syncDevice, serverNow } = vaultSync({
    trust: () => trust,
    session,
    serverOf,
    update,
  });

  const { syncEntries, syncChange } = entrySyncs({ current, trust: () => trust, syncDevice });

  /**
   * Pulls one vault anew and gives what the device then knows of the entry: a revoke starts from
   * the newest version, not from a key an older pull left (review of K-305 part 6b). Nothing when
   * the server does not answer or the device refused the entry (rolled back, missing).
   */
  const refresh = async (vaultIdText: string, entryId: Uint8Array) => {
    const state = current(vaultIdText);
    const pulled = state && (await pullNow(state));
    if (!pulled) return undefined;
    if (pulled.refused.some((r) => idKey(r.entryId) === idKey(entryId))) return undefined;
    return current(vaultIdText)?.device.known.get(idKey(entryId));
  };

  const entries = (): StoredEntry[] =>
    states().flatMap((state) =>
      [...state.device.known.values()].map((known) => ({
        idText: encodeBytes(known.entryId),
        vaultIdText: state.vault.idText,
        role: state.vault.role,
        rotationDue: state.vault.log.rotationDue,
        version: known.version,
        content: known.content,
      })),
    );
  const refused = () => states().flatMap((s) => s.refused);
  return {
    load,
    refresh,
    ...entryWrites(syncChange, current, update),
    ...entryImport(syncEntries, current, update),
    ...entryRotation({ current, states, pullNow, syncDevice }),
    ...entryResave({ current, pullNow, syncDevice, serverNow }),
    entries,
    refused,
  };
};

export type EntryStore = ReturnType<typeof createEntryStore>;
