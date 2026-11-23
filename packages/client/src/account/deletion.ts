/**
 * Deleting an account from a device (K-607, P-28), the same for every client: the passphrase is
 * checked against the account's own sealed AK first, so a typo deletes nothing and counts as no
 * failed sign-in; then the sign-in key, derived from it with the server's salt, answers the
 * deletion challenge. Neither the passphrase nor a key derived from it leaves the device.
 */
import {
  answerDeletionChallenge,
  type Derive,
  encodeBytes,
  loginKeyPair,
  type Stored,
  unlockWithPassphrase,
} from "@kennwort/core";
import type { DeletionRefusal, PrivacyApi } from "../session/privacy-api.ts";

export type DeletionApi = Pick<PrivacyApi, "deletionChallenge" | "deleteAccount"> & {
  keys: (token: string) => Promise<Stored | undefined>;
};

/** An account the device can act for: its ID, its session and its Secret Key */
export type DeletingAccount = { accountId: Uint8Array; token: string; secretKey: Uint8Array };

export type DeletionError = DeletionRefusal | "wrong-passphrase";
export type Deleted = { ok: true; company: boolean } | { ok: false; error: DeletionError };

/** Whether the passphrase opens the account's AK as the server keeps it */
export const checkPassphrase = async (
  api: Pick<DeletionApi, "keys">,
  account: DeletingAccount,
  passphrase: string,
  derive?: Derive,
): Promise<{ ok: true } | { ok: false; error: "wrong-passphrase" | "unreachable" }> => {
  const stored = await api.keys(account.token);
  if (!stored) return { ok: false, error: "unreachable" };
  const opened = unlockWithPassphrase(stored, passphrase, account.secretKey, derive);
  if (!opened.ok) return { ok: false, error: "wrong-passphrase" };
  // Only the check was wanted: this copy of AK goes at once
  opened.value.accountKey.fill(0);
  return { ok: true };
};

/** Answers a fresh deletion challenge with the sign-in key and deletes the account */
export const confirmDeletion = async (
  api: DeletionApi,
  account: DeletingAccount,
  passphrase: string,
  derive?: Derive,
): Promise<Deleted> => {
  const challenge = await api.deletionChallenge(account.token);
  if (!challenge) return { ok: false, error: "unexpected" };
  const key = loginKeyPair(
    passphrase,
    challenge.accountSalt,
    account.secretKey,
    account.accountId,
    derive,
  );
  const signature = answerDeletionChallenge(
    key.secretKey,
    encodeBytes(account.accountId),
    challenge.challenge,
  );
  key.secretKey.fill(0);
  return api.deleteAccount(account.token, challenge.challengeId, signature);
};
