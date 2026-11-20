/**
 * Sharing a single entry from its vault (K-305 part 6b, P-10), without any interface: a member who
 * may edit wraps the entry's key to a certified colleague outside the vault; revoking deletes the
 * share, writes the entry anew under a new entry key and makes the remaining shares again with it,
 * so the removed person cannot read a later version with the key they had.
 */
import {
  bytes,
  type Certificate,
  type EntryKey,
  genuineShares,
  idKey,
  type MemberView,
  makeShare,
  reshare,
  type Share,
  type Trust,
} from "@kennwort/core";
import type { SaveError } from "../entries/entry-store.ts";
import type { Session } from "../session/session.ts";
import type { ShareApi } from "../session/shares-api.ts";
import { hasExpired } from "../vaults/vault-members.ts";
import type { Vault } from "../vaults/vaults.ts";

export type ShareError = "locked" | "no-key" | "past" | "unreachable" | "not-renewed";
type Done = { ok: true } | { ok: false; error: ShareError };

/** What sharing needs of the entry store: the entry's key and writing it under a new one */
export type EntryKeys = {
  keyOf: (vaultIdText: string, entryIdText: string) => EntryKey | undefined;
  rekey: (
    vaultIdText: string,
    entryIdText: string,
  ) => Promise<{ ok: true; value: EntryKey } | { ok: false; error: SaveError }>;
};

const seconds = () => Math.floor(Date.now() / 1000);

/** Who may share: a member who may edit the vault, like the server allows (P-10) */
export const mayShare = (vault: Vault) => vault.role === "edit" || vault.role === "manage";

const placeOf = (vault: Vault, entryIdText: string) => {
  const entryId = bytes(16).safeParse(entryIdText);
  return entryId.success ? { vaultId: vault.ring.vaultId, entryId: entryId.data } : undefined;
};

const authorOf = (session: Session) => {
  const opened = session.opened();
  return opened
    ? {
        token: opened.token,
        author: { id: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey },
      }
    : undefined;
};

/**
 * The entry's shares the server lists, as far as this device can trust them: signed by an editor
 * of the vault over the key the entry has now (genuineShares)
 */
export const loadShares = async (
  api: ShareApi,
  session: Session,
  keys: EntryKeys,
  vault: Vault,
  entryIdText: string,
  trust: Trust,
): Promise<Share[] | undefined> => {
  const token = session.opened()?.token;
  const place = placeOf(vault, entryIdText);
  const key = keys.keyOf(vault.idText, entryIdText);
  if (!token || !place || !key) return undefined;
  const listed = await api.entryShares(token, place.vaultId, place.entryId);
  const now = { ...trust, now: seconds() };
  return listed && genuineShares(listed, key.entryKey, place, vault.log, now);
};

/** Shares the entry with a colleague, until the end of a day in Unix seconds (0: no end) */
export const shareWith = async (
  api: ShareApi,
  session: Session,
  keys: EntryKeys,
  vault: Vault,
  entryIdText: string,
  person: Certificate,
  validUntil: number,
): Promise<Done> => {
  const me = authorOf(session);
  if (!me) return { ok: false, error: "locked" };
  // A time limit already over would share with someone who can never read it
  if (hasExpired({ validUntil })) return { ok: false, error: "past" };
  const place = placeOf(vault, entryIdText);
  const key = keys.keyOf(vault.idText, entryIdText);
  if (!place || !key) return { ok: false, error: "no-key" };
  const share = makeShare(me.author, key.entryKey, person, place, { validUntil, time: seconds() });
  return (await api.putShare(me.token, share)) ? { ok: true } : { ok: false, error: "unreachable" };
};

/**
 * Revokes a share (P-10): the server stops serving it, the entry is written anew under a new entry
 * key, and every other genuine share is made again with that key, or it would no longer open
 */
export const revokeShare = async (
  api: ShareApi,
  session: Session,
  keys: EntryKeys,
  vault: Vault,
  entryIdText: string,
  recipient: Uint8Array,
  trust: Trust,
): Promise<Done> => {
  const me = authorOf(session);
  if (!me) return { ok: false, error: "locked" };
  const place = placeOf(vault, entryIdText);
  const old = keys.keyOf(vault.idText, entryIdText);
  if (!place || !old) return { ok: false, error: "no-key" };
  if (!(await api.deleteShare(me.token, place.vaultId, place.entryId, recipient)))
    return { ok: false, error: "unreachable" };
  const renewed = await keys.rekey(vault.idText, entryIdText);
  if (!renewed.ok) return { ok: false, error: "not-renewed" };
  const listed = await api.entryShares(me.token, place.vaultId, place.entryId);
  if (!listed) return { ok: false, error: "unreachable" };
  const now = { ...trust, now: seconds() };
  const remaining = genuineShares(listed, old.entryKey, place, vault.log, now).filter(
    (share) => idKey(share.recipient) !== idKey(recipient),
  );
  const again = reshare(me.author, renewed.value.entryKey, remaining, now, now.now);
  const stored = await Promise.all(again.map((share) => api.putShare(me.token, share)));
  return stored.every(Boolean) ? { ok: true } : { ok: false, error: "unreachable" };
};

/** The name the company's member list gives an account, if any */
export const personName = (people: MemberView[], accountId: Uint8Array) =>
  people.find((person) => idKey(person.accountId) === idKey(accountId))?.name ?? null;
