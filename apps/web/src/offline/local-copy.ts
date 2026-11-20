/**
 * The device's offline copy (K-308 part b, docs/sicherheitsdesign.md P-22): what the app needs to
 * unlock and read without the server, and only what is ciphertext or the server holds anyway.
 *
 * - The account (`keys`): wrapped AK, key block and account state as the server serves them, and
 *   the account state this device saw last (`state`, sealed under AK). The session writes both
 *   once it has opened them (session/offline-unlock.ts).
 * - The server's answers the vaults are read from (`read:<path>`, copy-fetch.ts).
 * - Per vault the records of its entries (`records:<vault>`): only those that passed the checks of
 *   P-09, the highest version per entry, which the next pull checks the server against (E-13, E-15).
 *
 * Nothing unlocked goes in: no AK, no key, no passphrase, no plaintext of an entry.
 */
import {
  bytes,
  EntryRecord,
  encodeBytes,
  idKey,
  recordToWire,
  type Stored,
  StoredWire,
} from "@kennwort/core";
import { createCopyFetch, isObject, parseJson } from "./copy-fetch.ts";
import { createCopyScope } from "./copy-scope.ts";
import type { KeyValue } from "./key-value.ts";

/** The account state as this device kept it: sealed under AK with the counter in its AAD */
export type KeptState = { counter: number; sealed: Uint8Array };

const storedToWire = (stored: Stored) => ({
  accountId: encodeBytes(stored.accountId),
  accountSalt: encodeBytes(stored.accountSalt),
  keyBlock: encodeBytes(stored.keyBlock),
  state: encodeBytes(stored.state),
  stateCounter: stored.stateCounter,
  unlock: {
    passphrase: encodeBytes(stored.unlock.passphrase),
    recovery: encodeBytes(stored.unlock.recovery),
  },
});

const parseKept = (text: string | undefined): KeptState | undefined => {
  const parsed = parseJson(text);
  if (!isObject(parsed)) return undefined;
  const { counter } = parsed;
  const sealed = bytes().safeParse(parsed.sealed);
  return typeof counter === "number" && Number.isInteger(counter) && counter >= 0 && sealed.success
    ? { counter, sealed: sealed.data }
    : undefined;
};

const parseRecords = (text: string | undefined) => {
  const items = parseJson(text);
  return Array.isArray(items)
    ? items.flatMap((item) => {
        const record = EntryRecord.safeParse(item);
        return record.success ? [record.data] : [];
      })
    : [];
};

/** The account's ciphertexts, for the session to unlock with when the server does not answer */
const accountPart = (store: KeyValue, scope: ReturnType<typeof createCopyScope>) => {
  const keptState = async () => parseKept(await store.get("state"));
  return {
    /** The ciphertexts to unlock with, with the account state this device kept last */
    keys: (id: string) =>
      scope.forAccount(
        id,
        async (): Promise<Stored | undefined> => {
          const parsed = StoredWire.safeParse(parseJson(await store.get("keys")));
          if (!parsed.success) return undefined;
          const state = await keptState();
          return state
            ? { ...parsed.data, state: state.sealed, stateCounter: state.counter }
            : parsed.data;
        },
        undefined,
      ),
    keepKeys: (id: string, stored: Stored) =>
      scope.forAccount(
        id,
        () => store.set("keys", JSON.stringify(storedToWire(stored))),
        undefined,
      ),
    state: (id: string) => scope.forAccount(id, keptState, undefined),
    keepState: (id: string, kept: KeptState) =>
      scope.forAccount(
        id,
        () =>
          store.set(
            "state",
            JSON.stringify({ counter: kept.counter, sealed: encodeBytes(kept.sealed) }),
          ),
        undefined,
      ),
  };
};

/** The checked records of each vault's entries */
const recordsPart = (store: KeyValue, scope: ReturnType<typeof createCopyScope>) => ({
  /** The records kept for a vault, to be checked like any the server sends */
  records: (vaultIdText: string) =>
    scope.forCurrent(
      async () => parseRecords(await store.get(`records:${vaultIdText}`)),
      [] as EntryRecord[],
    ),
  /**
   * Keeps each record that is newer than the kept one of its entry and passes the check: the
   * check is P-09's, so a record the device refused never becomes what it checks against
   */
  keepRecords: (vaultIdText: string, records: EntryRecord[], check: (r: EntryRecord) => boolean) =>
    scope.forCurrent(async () => {
      const key = `records:${vaultIdText}`;
      const kept = new Map(parseRecords(await store.get(key)).map((r) => [idKey(r.entryId), r]));
      let changed = false;
      for (const record of records) {
        const known = kept.get(idKey(record.entryId));
        if ((known && known.version >= record.version) || !check(record)) continue;
        kept.set(idKey(record.entryId), record);
        changed = true;
      }
      if (changed) await store.set(key, JSON.stringify([...kept.values()].map(recordToWire)));
    }, undefined),
});

export const createLocalCopy = (store: KeyValue, now: () => number = Date.now) => {
  const scope = createCopyScope(store, now);
  const { reachable, fetch } = createCopyFetch(store, scope);
  return {
    reachable,
    /** When this device last had the vault list from the server, in milliseconds */
    syncedAt: scope.syncedAt,
    fetch,
    useAccount: scope.useAccount,
    forget: scope.forget,
    settled: scope.settled,
    ...accountPart(store, scope),
    ...recordsPart(store, scope),
  };
};

export type LocalCopy = ReturnType<typeof createLocalCopy>;
