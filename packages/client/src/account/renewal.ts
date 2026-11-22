/**
 * Renewing the account's keys after its recovery kit got into other hands (P-12, K-307 part e),
 * shared by whoever offers it: the passphrase checked against the account as it unlocks now (a
 * typo would lock it for good), the state merged with the server's, new keys made (rekeyAccount)
 * with every vault key this device holds wrapped to the new bundle, and the server's answer.
 * What follows in the vaults, once an owner or admin certified the new bundle, is the vault
 * catch-up's (apps/web/src/vaults/renewal.ts).
 */
import {
  type Derive,
  encodeBytes,
  type Keyring,
  mergeStates,
  type Rekeyed,
  rekeyAccount,
  type Stored,
  signAudit,
  unlockWithPassphrase,
} from "@kennwort/core";
import { constantTimeEqual, randomBytes } from "@kennwort/crypto";
import type { Api } from "../session/api.ts";
import type { Opened } from "../session/open-account.ts";
import type { RecoveryApi } from "../session/recovery-api.ts";

export type RenewalApi = Pick<Api, "keys" | "rekey"> & Pick<RecoveryApi, "auditAction">;
export type RenewalError = "wrong-passphrase" | "unreachable" | "damaged" | "refused" | "conflict";

export type Renewed = {
  /** The account open under its new keys, with the same session */
  opened: Opened;
  secretKey: Uint8Array;
  recoveryKey: Uint8Array;
  /** The account's ciphertexts as the server now holds them, for the offline copy */
  stored: Stored;
};

export type RenewalInput = {
  passphrase: string;
  /** The Secret Key this device unlocks with now */
  secretKey: Uint8Array;
  /** Every vault key this device holds, of every epoch */
  rings: readonly Keyring[];
  /** The company, to sign the renewal into the audit log (P-20); none, no entry */
  companyId?: Uint8Array | undefined;
  derive?: Derive | undefined;
};

const ATTEMPTS = 2;

const storedOf = (accountId: Uint8Array, made: Rekeyed): Stored => ({
  accountId,
  accountSalt: made.upload.accountSalt,
  keyBlock: made.upload.keyBlock,
  state: made.upload.state,
  stateCounter: made.upload.stateCounter,
  unlock: made.upload.unlock,
});

/** One attempt on top of the state the server holds now; "stale" when another device wrote first */
const attempt = async (
  api: RenewalApi,
  opened: Opened,
  input: RenewalInput,
): Promise<{ ok: true; value: Rekeyed } | { ok: false; error: RenewalError | "stale" }> => {
  const stored = await api.keys(opened.token);
  if (!stored) return { ok: false, error: "unreachable" };
  const now = unlockWithPassphrase(stored, input.passphrase, input.secretKey, input.derive);
  if (!now.ok || !constantTimeEqual(now.value.accountKey, opened.accountKey))
    return {
      ok: false,
      error: now.ok || now.error === "wrong-key" ? "wrong-passphrase" : "damaged",
    };
  const state = mergeStates(opened.state, now.value.state);
  if (!state.ok) return { ok: false, error: "damaged" };
  const made = rekeyAccount(
    { ...opened, state: state.value, stateCounter: stored.stateCounter },
    input.passphrase,
    input.rings,
    input.derive ? { derive: input.derive } : {},
  );
  const answer = await api.rekey(opened.token, made.upload);
  return answer === "ok" ? { ok: true, value: made } : { ok: false, error: answer };
};

/** The renewal signed into the audit log with the new key, once (P-20) */
const audit = (api: RenewalApi, opened: Opened, companyId: Uint8Array) => {
  const event = {
    companyId: encodeBytes(companyId),
    actor: encodeBytes(opened.accountId),
    action: "account-rekey" as const,
    subject: encodeBytes(randomBytes(16)),
  };
  return api.auditAction(
    opened.token,
    event.action,
    event.subject,
    signAudit(opened.keyBlock.ed.secretKey, event),
  );
};

export const renewKeys = async (
  api: RenewalApi,
  opened: Opened,
  input: RenewalInput,
): Promise<{ ok: true; value: Renewed } | { ok: false; error: RenewalError }> => {
  for (let tried = 0; tried < ATTEMPTS; tried++) {
    const done = await attempt(api, opened, input);
    if (!done.ok) {
      if (done.error === "stale") continue;
      return { ok: false, error: done.error };
    }
    const made = done.value;
    const next: Opened = {
      accountId: opened.accountId,
      token: opened.token,
      accountKey: made.accountKey,
      keyBlock: made.keyBlock,
      state: made.state,
    };
    if (input.companyId) await audit(api, next, input.companyId);
    return {
      ok: true,
      value: {
        opened: next,
        secretKey: made.secretKey,
        recoveryKey: made.recoveryKey,
        stored: storedOf(opened.accountId, made),
      },
    };
  }
  return { ok: false, error: "conflict" };
};
