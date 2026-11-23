/**
 * The session's side of the offline copy (K-308 part b, P-22): after every unlock with the server
 * the device keeps the account's ciphertexts and the account state it saw, both as ciphertext;
 * without the server it unlocks from them with passphrase and Secret Key. The account state kept on
 * the device is merged into whatever the server serves, so a server that serves an older one later
 * cannot roll back what this device has checked (E-07, E-13).
 */

import type { AccountApi } from "@kennwort/client/session/api.ts";
import { mergedState as merged } from "@kennwort/client/session/kept-state.ts";
import {
  type AccountState,
  encodeBytes,
  openState,
  type Stored,
  sealState,
  type Unlocked,
  unlockWithPassphrase,
} from "@kennwort/core";
import { ed25519KeyPair, passphraseKeys } from "@kennwort/crypto";
import type { LocalCopy } from "../offline/local-copy.ts";
import type { Opened, Outcome } from "./session.ts";

/** What the session uses of the copy */
export type AccountCopy = Pick<
  LocalCopy,
  "useAccount" | "forget" | "keys" | "keepKeys" | "state" | "keepState" | "suspend"
>;

/** The state the server served, with what this device kept merged into it */
export const withKeptState = async (
  copy: AccountCopy | undefined,
  accountId: Uint8Array,
  unlocked: Unlocked,
): Promise<Unlocked> => {
  const kept = await copy?.state(encodeBytes(accountId));
  if (!kept) return unlocked;
  const state = openState(unlocked.accountKey, accountId, kept.counter, kept.sealed);
  return state.ok ? { ...unlocked, state: merged(state.value, unlocked.state) } : unlocked;
};

/** The server's state of the account merged into the open one (after signing in again) */
export const withServedState = (opened: Opened, stored: Stored): AccountState => {
  const served = openState(opened.accountKey, opened.accountId, stored.stateCounter, stored.state);
  return served.ok ? merged(opened.state, served.value) : opened.state;
};

/**
 * Keeps the account's ciphertexts as the server served them and the open state sealed under AK,
 * with the counter of the served one in its AAD. Only an account state that opens with this AK, so
 * the ciphertexts of this account, is kept.
 */
export const keepAccount = async (
  copy: AccountCopy | undefined,
  stored: Stored,
  opened: Opened,
) => {
  const opens = openState(opened.accountKey, opened.accountId, stored.stateCounter, stored.state);
  if (!copy || !opens.ok) return;
  const id = encodeBytes(opened.accountId);
  await copy.keepKeys(id, stored);
  const counter = stored.stateCounter;
  await copy.keepState(id, {
    counter,
    sealed: sealState(opened.accountKey, opened.accountId, counter, opened.state),
  });
};

/** The account's ciphertexts fetched from the server and kept, after an unlock that had none */
export const keepFromServer = async (
  api: Pick<AccountApi, "keys">,
  copy: AccountCopy | undefined,
  opened: Opened,
) => {
  const stored = copy && (await api.keys(opened.token));
  if (stored) await keepAccount(copy, stored, opened);
};

/**
 * Unlocks from the copy: AK from the kept wrapped AK, key block and the kept state with it. The
 * sign-in key comes from the same derivation and stays in memory, so the device can sign in when
 * the server answers again without keeping the passphrase (P-02). There is no token until then.
 */
export const unlockFromCopy = async (
  copy: AccountCopy,
  accountId: Uint8Array,
  passphrase: string,
  secretKey: Uint8Array,
  derive = passphraseKeys,
): Promise<Outcome<Opened>> => {
  const stored = await copy.keys(encodeBytes(accountId));
  if (!stored) return { ok: false, error: "unreachable" };
  const keys = derive(passphrase, stored.accountSalt, secretKey, accountId);
  const unlocked = unlockWithPassphrase(stored, passphrase, secretKey, () => keys);
  keys.unlock.fill(0);
  if (!unlocked.ok) {
    keys.login.fill(0);
    return { ok: false, error: unlocked.error === "wrong-key" ? "wrong-passphrase" : "unexpected" };
  }
  const loginKey = ed25519KeyPair(keys.login).secretKey;
  return { ok: true, value: { ...unlocked.value, accountId, token: "", loginKey } };
};
