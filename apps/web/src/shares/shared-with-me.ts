/**
 * "Mit mir geteilt" (K-305 part 6b, P-10): the entries colleagues shared with this account. Each
 * share and its record pass openShared against the company's certificates before anything shows;
 * a share whose record no longer opens (revoked: a new entry key) is left out. The highest version
 * seen of each shared entry goes into the account state, so a server that later serves an older
 * one is refused (E-13).
 */
import {
  type AccountState,
  certificateFingerprint,
  certificateOf,
  type EntryContent,
  encodeBytes,
  type MemberView,
  openShared,
  type ShareReader,
  type Trust,
} from "@kennwort/core";
import { createSignal } from "solid-js";
import type { Opened, Session } from "../session/session.ts";
import type { ShareApi } from "../session/shares-api.ts";
import type { StateDeps } from "../session/state-sync.ts";
import { personName } from "./shares.ts";

export type SharedEntry = {
  idText: string;
  vaultIdText: string;
  version: number;
  content: EntryContent;
  /** The colleague who shared it, by the company's member list */
  sharedBy: string | null;
};

const readerOf = (opened: Opened, trust: Trust): ShareReader | undefined => {
  const mine = certificateOf(trust, opened.accountId);
  return mine
    ? {
        accountId: opened.accountId,
        secretKey: opened.keyBlock.xwing.secretKey,
        fingerprint: certificateFingerprint(mine),
      }
    : undefined;
};

/** The versions that went beyond what the account state remembers, or nothing to write */
export const higherVersions = (entries: SharedEntry[]) => (state: AccountState) => {
  const higher = entries.filter((e) => (state.versions[e.idText] ?? 0) < e.version);
  if (higher.length === 0) return undefined;
  const versions = { ...state.versions };
  for (const e of higher) versions[e.idText] = e.version;
  return { ...state, versions };
};

/** Every entry shared with this account that opens; one per entry, whatever the server lists */
export const loadSharedWithMe = async (
  api: ShareApi & StateDeps,
  session: Session,
  trust: Trust,
  people: MemberView[],
): Promise<SharedEntry[] | undefined> => {
  const opened = session.opened();
  const me = opened && readerOf(opened, trust);
  if (!opened || !me) return undefined;
  const shares = await api.sharedWithMe(opened.token);
  if (!shares) return undefined;
  const now = { ...trust, now: Math.floor(Date.now() / 1000) };
  const found = new Map<string, SharedEntry>();
  for (const share of shares) {
    const idText = encodeBytes(share.entryId);
    if (found.has(idText)) continue;
    const record = await api.sharedRecord(opened.token, share.vaultId, share.entryId);
    const seen = opened.state.versions[idText] ?? 0;
    const content = record && openShared(share, record, me, now, seen);
    if (!record || !content?.ok) continue;
    found.set(idText, {
      idText,
      vaultIdText: encodeBytes(share.vaultId),
      version: record.version,
      content: content.value,
      sharedBy: personName(people, share.sharer),
    });
  }
  const entries = [...found.values()];
  if (entries.some((e) => (opened.state.versions[e.idText] ?? 0) < e.version))
    await session.updateState(api, higherVersions(entries));
  return entries;
};

/** The shared entries while the account is open; a load that fails keeps what was there */
export const createSharedWithMe = (api: ShareApi & StateDeps, session: Session) => {
  const [entries, setEntries] = createSignal<SharedEntry[]>([]);
  let generation = 0;
  const load = async (trust: Trust, people: MemberView[]) => {
    const mine = ++generation;
    const loaded = await loadSharedWithMe(api, session, trust, people);
    if (loaded && mine === generation) setEntries(loaded);
  };
  return { load, entries };
};

export type SharedWithMe = ReturnType<typeof createSharedWithMe>;
