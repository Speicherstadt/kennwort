/**
 * The entries of every vault this account opened (K-306, P-09, P-21): each vault has its device
 * state in memory; loading pulls and checks every record against the vault's checked log, a change
 * goes into the device's queue and is synced as the next version. Unlocked content lives only in
 * memory; nothing here is written to storage.
 */
import {
  bytes,
  type Connection,
  type Device,
  type EntryContent,
  edit,
  emptyDevice,
  encodeBytes,
  httpServer,
  idKey,
  pull,
  type Refused,
  type SyncContext,
  type SyncServer,
  sync,
  type Trust,
} from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";
import { createSignal } from "solid-js";
import type { Session } from "../session/session.ts";
import type { Vault } from "../vaults/vaults.ts";
import type { StoredEntry } from "./entries.ts";

export type ServerFor = (token: string, vaultId: Uint8Array) => SyncServer;

/** The sync server of the app: same origin, the session's token */
export const httpServerFor =
  (send: typeof fetch = fetch): ServerFor =>
  (token, vaultId) => {
    const connection: Connection = { fetch: send, baseUrl: "", token };
    return httpServer(connection, vaultId);
  };

type VaultState = { vault: Vault; device: Device; refused: Refused[] };
export type SaveError = "locked" | "read-only" | "unreachable" | "not-saved";

const contextOf = (session: Session, vault: Vault, trust: Trust): SyncContext | undefined => {
  const opened = session.opened();
  if (!opened) return undefined;
  const now = Math.floor(Date.now() / 1000);
  return {
    author: { id: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey },
    ring: vault.ring,
    log: vault.log,
    trust: { ...trust, now },
    lastSeen: vault.log.hash,
    now,
  };
};

export const createEntryStore = (serverFor: ServerFor, session: Session) => {
  const [states, setStates] = createSignal<VaultState[]>([]);
  let trust: Trust | undefined;
  const serverOf = (vault: Vault) => {
    const token = session.opened()?.token;
    return token ? serverFor(token, vault.ring.vaultId) : undefined;
  };

  /** Pulls every vault anew; a vault that does not answer keeps what it had */
  const load = async (vaults: Vault[], checkedBy: Trust) => {
    trust = checkedBy;
    const before = new Map(states().map((s) => [s.vault.idText, s]));
    // Known at once, so a change made while the vaults still pull has a vault to go to
    setStates(
      vaults.map((vault) => ({
        vault,
        device: before.get(vault.idText)?.device ?? emptyDevice(),
        refused: before.get(vault.idText)?.refused ?? [],
      })),
    );
    const next = await Promise.all(
      vaults.map(async (vault): Promise<VaultState> => {
        const known = before.get(vault.idText)?.device ?? emptyDevice();
        const ctx = contextOf(session, vault, checkedBy);
        const server = serverOf(vault);
        if (!ctx || !server) return { vault, device: known, refused: [] };
        const pulled = await pull(known, server, ctx).catch(() => undefined);
        return pulled ? { vault, ...pulled } : { vault, device: known, refused: [] };
      }),
    );
    setStates(next);
  };

  /** A new entry (no ID) or a change, synced at once; it stays queued if the server failed */
  const save = async (
    vaultIdText: string,
    content: EntryContent,
    entryIdText?: string,
  ): Promise<{ ok: true; value: string } | { ok: false; error: SaveError }> => {
    const state = states().find((s) => s.vault.idText === vaultIdText);
    if (!state || !trust) return { ok: false, error: "unreachable" };
    if (state.vault.role === "read") return { ok: false, error: "read-only" };
    const ctx = contextOf(session, state.vault, trust);
    const server = serverOf(state.vault);
    if (!ctx || !server) return { ok: false, error: "locked" };
    const given = entryIdText === undefined ? undefined : bytes(16).safeParse(entryIdText);
    if (given && !given.success) return { ok: false, error: "unreachable" };
    const entryId = given?.data ?? randomBytes(16);
    const queued = edit(state.device, entryId, content);
    const synced = await sync(queued, server, ctx).catch(() => undefined);
    const device = synced?.device ?? queued;
    setStates(states().map((s) => (s === state ? { ...s, device } : s)));
    if (!synced) return { ok: false, error: "unreachable" };
    const stillQueued = device.queue.some((op) => idKey(op.entryId) === idKey(entryId));
    return stillQueued
      ? { ok: false, error: "not-saved" }
      : { ok: true, value: encodeBytes(entryId) };
  };

  const entries = (): StoredEntry[] =>
    states().flatMap((state) =>
      [...state.device.known.values()].map((known) => ({
        idText: encodeBytes(known.entryId),
        vaultIdText: state.vault.idText,
        role: state.vault.role,
        version: known.version,
        content: known.content,
      })),
    );
  const refused = () => states().flatMap((s) => s.refused);
  return { load, save, entries, refused };
};

export type EntryStore = ReturnType<typeof createEntryStore>;
