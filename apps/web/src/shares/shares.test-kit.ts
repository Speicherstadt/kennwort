// Sharing for the web tests (K-305 part 6b): Jonas keeps the Sparkasse login in Büro; Anna and Max
// work at Weber Haustechnik but are no members of Büro. A share server in memory stores what it is
// given, as the real one does, and can be told to serve an older record, as a server that means harm

import { createEntryStore, type ServerFor } from "@kennwort/client/entries/entry-store.ts";
import type { ShareApi } from "@kennwort/client/session/shares-api.ts";
import type { StateDeps } from "@kennwort/client/session/state-sync.ts";
import { loadVaults, newVault } from "@kennwort/client/vaults/vaults.ts";
import {
  type AccountState,
  type EntryRecord,
  emptyState,
  encodeBytes,
  memoryServer,
  type Share,
  type SyncServer,
} from "@kennwort/core";
import { loginContent } from "../entries/entries.test-kit.ts";
import { annaRow, type jonasCompany, ownerRow } from "../members/members.test-kit.ts";
import type { Session } from "../session/session.ts";
import { certifiedRow, jonasWithVaults } from "../vaults/vaults.test-kit.ts";
import data from "./shares.test-data.json";

type Company = Awaited<ReturnType<typeof jonasCompany>>;

// Data, not texts: the company's own words live in shares.test-data.json, as the demo's do
export const sparkasseLogin = loginContent(data.login, data.names);
const [jonasName, annaName, maxName] = data.colleagues;

/** A colleague outside Büro: a certified row of the members list and the account's keys */
const colleague = (c: Company, name: string) => {
  const { row, account } = annaRow(c);
  return { row: certifiedRow(c, { ...row, name }), account };
};
export type Colleague = ReturnType<typeof colleague>;

/** The shares by vault and entry, and which record each entry has on the sync server */
export const shareServer = (
  syncOf: (vaultId: Uint8Array) => SyncServer,
  accounts: Map<string, Uint8Array>,
) => {
  const shares: Share[] = [];
  const place = (s: Share) => `${encodeBytes(s.vaultId)}/${encodeBytes(s.entryId)}`;
  const at = (vaultId: Uint8Array, entryId: Uint8Array) =>
    `${encodeBytes(vaultId)}/${encodeBytes(entryId)}`;
  const owner = (token: string) => encodeBytes(accounts.get(token) ?? new Uint8Array());
  /** A record the server serves instead of the newest one, as a server that plays one back */
  const pinned = new Map<string, EntryRecord>();
  const api: ShareApi = {
    putShare: async (_t, share) => {
      const same = shares.findIndex(
        (s) =>
          place(s) === place(share) && encodeBytes(s.recipient) === encodeBytes(share.recipient),
      );
      if (same >= 0) shares.splice(same, 1);
      shares.push(share);
      return true;
    },
    entryShares: async (_t, vaultId, entryId) =>
      shares.filter((s) => place(s) === at(vaultId, entryId)),
    deleteShare: async (_t, vaultId, entryId, recipient) => {
      const index = shares.findIndex(
        (s) =>
          place(s) === at(vaultId, entryId) && encodeBytes(s.recipient) === encodeBytes(recipient),
      );
      if (index >= 0) shares.splice(index, 1);
      return true;
    },
    sharedWithMe: async (token) => shares.filter((s) => encodeBytes(s.recipient) === owner(token)),
    sharedRecord: async (token, vaultId, entryId) => {
      const mine = shares.some(
        (s) => place(s) === at(vaultId, entryId) && encodeBytes(s.recipient) === owner(token),
      );
      if (!mine) return undefined;
      const records = await syncOf(vaultId).pull();
      const newest = records.find((r) => encodeBytes(r.entryId) === encodeBytes(entryId));
      return pinned.get(at(vaultId, entryId)) ?? newest;
    },
  };
  return { api, shares, pinned, at };
};

/** A colleague's unlocked account as the share code reads it; the account state stays in memory */
export const sessionOf = (who: Colleague, token: string, rootFingerprint: Uint8Array) => {
  let state: AccountState = emptyState(rootFingerprint);
  const session = {
    opened: () => ({
      accountId: who.account.accountId,
      accountKey: who.account.accountKey,
      keyBlock: who.account.keyBlock,
      state,
      token,
    }),
    updateState: async (_api: StateDeps, change: (s: AccountState) => AccountState | undefined) => {
      const next = change(state);
      if (next) state = next;
      return { ok: true };
    },
  };
  return { session: session as unknown as Session, state: () => state };
};

/** Jonas with Büro and the Sparkasse login in it, Anna and Max outside Büro, and the share server */
export const sparkasseInBuero = async () => {
  let anna: Colleague | undefined;
  let max: Colleague | undefined;
  const w = await jonasWithVaults((c) => {
    anna = colleague(c, annaName ?? "");
    max = colleague(c, maxName ?? "");
    return [{ ...ownerRow(c), name: jonasName ?? null }, anna.row, max.row];
  });
  if (!anna || !max) throw new Error("no colleagues");
  const made = await newVault(w.api, w.c.session, data.vault);
  if (!made.ok) throw new Error(made.error);
  const loaded = await loadVaults(w.api, w.c.session);
  if (!loaded.ok) throw new Error(loaded.error);
  const sync = new Map<string, SyncServer>();
  const syncOf = (vaultId: Uint8Array) => {
    const server = sync.get(encodeBytes(vaultId)) ?? memoryServer();
    sync.set(encodeBytes(vaultId), server);
    return server;
  };
  const serverFor: ServerFor = (_token, vaultId) => syncOf(vaultId);
  const store = createEntryStore(serverFor, w.c.session);
  await store.load(loaded.value.vaults, loaded.value.trust);
  const saved = await store.save(made.value, sparkasseLogin);
  if (!saved.ok) throw new Error(saved.error);
  const accounts = new Map([
    ["t-anna", anna.account.accountId],
    ["t-max", max.account.accountId],
  ]);
  const shares = shareServer(syncOf, accounts);
  const vault = loaded.value.vaults.find((v) => v.idText === made.value);
  if (!vault) throw new Error("no vault");
  return {
    ...w,
    loaded: loaded.value,
    vault,
    store,
    entryIdText: saved.value,
    anna,
    max,
    shares,
    syncOf,
  };
};
