/**
 * The key block written anew after a root change (K-307 part f, P-07) carries a signature of the
 * account's own Ed25519 key, which only AK opens from the key block and whose public half the
 * server holds with the bundle. The key block holds the account's private keys: a session alone
 * must not replace it, as it cannot replace the unlock ways (renew.ts), or whoever holds one
 * destroys the keys for good (found in review).
 */
import { type Part, sign } from "@kennwort/crypto";

export const KEY_BLOCK_PURPOSE = "key-block";

/** What the proof signs: the account (its text, as the server keeps it) and the sealed block */
export const keyBlockFields = (accountIdText: string, sealed: Uint8Array): Part[] => [
  accountIdText,
  sealed,
];

export const proveKeyBlock = (edSecretKey: Uint8Array, accountIdText: string, sealed: Uint8Array) =>
  sign(edSecretKey, KEY_BLOCK_PURPOSE, ...keyBlockFields(accountIdText, sealed));
