/**
 * The passphrase is forgotten (P-12): sign in and open AK with the Recovery Key, then choose a new
 * passphrase and get a new Recovery Key; the old one is spent. A device that knows this account
 * keeps its Secret Key, so the account's other devices go on working; another device cannot know
 * it and makes a new one, which the new kit shows.
 */
import { bytes, encodeBytes, renewUnlock, unlockWithRecoveryKey } from "@kennwort/core";
import { randomBytes, SECRET_KEY_LENGTH } from "@kennwort/crypto";
import type { DeviceAccount } from "./device.ts";
import {
  type NewKeys,
  type Opened,
  type Outcome,
  type SessionDeps,
  type SessionError,
  signInError,
} from "./session.ts";

const fail = (error: SessionError) => ({ ok: false as const, error });

export const recoverAccount = async (
  deps: Pick<SessionDeps, "api" | "derive" | "random">,
  known: DeviceAccount | undefined,
  recoveryKey: Uint8Array,
  passphrase: string,
  accountIdText?: string,
): Promise<Outcome<{ opened: Opened; keys: NewKeys }>> => {
  const id = bytes(16).safeParse(accountIdText ?? known?.accountId);
  if (!id.success) return fail("wrong-recovery-key");
  const accountId = id.data;
  const signedIn = await deps.api.signInWithRecovery(accountId, recoveryKey);
  if (!signedIn.ok) {
    const error = signInError(signedIn.error);
    return fail(error === "wrong-passphrase" ? "wrong-recovery-key" : error);
  }
  const stored = await deps.api.keys(signedIn.token);
  if (!stored) return fail("unexpected");
  const unlocked = unlockWithRecoveryKey(stored, recoveryKey);
  if (!unlocked.ok)
    return fail(unlocked.error === "wrong-key" ? "wrong-recovery-key" : "unexpected");
  const secretKey =
    known?.accountId === encodeBytes(accountId)
      ? known.secretKey
      : (deps.random ?? randomBytes)(SECRET_KEY_LENGTH);
  const options = deps.derive ? { derive: deps.derive } : {};
  const renewed = renewUnlock(unlocked.value.accountKey, accountId, passphrase, secretKey, options);
  if (!(await deps.api.replaceUnlock(signedIn.token, renewed.upload))) return fail("unexpected");
  return {
    ok: true,
    value: {
      opened: { ...unlocked.value, accountId, token: signedIn.token },
      keys: { accountId, secretKey, recoveryKey: renewed.recoveryKey },
    },
  };
};
