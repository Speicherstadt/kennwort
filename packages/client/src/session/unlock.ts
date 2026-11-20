/**
 * Signing in and unlocking with the passphrase (P-02, P-03), the same for the web app and the
 * extension: sign in with the sign-in key, load the ciphertexts, open them. What is open stays in
 * memory (the web app) or in chrome.storage.session (the extension), never on the disk.
 */
import { type Derive, type Stored, unlockWithPassphrase } from "@kennwort/core";
import type { AccountApi } from "./api.ts";
import type { Opened } from "./open-account.ts";

/** After the web app's ten minutes without a key press or click, the account locks (P-03) */
export const LOCK_AFTER_MS = 10 * 60 * 1000;

export type SessionError =
  | "wrong-code"
  | "invalid-invitation"
  | "too-many-requests"
  | "wrong-passphrase"
  | "wrong-recovery-key"
  | "unreachable"
  | "unexpected";
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: SessionError };

export const signInError = (error: string): SessionError =>
  error === "denied"
    ? "wrong-passphrase"
    : error === "too-many-requests" || error === "locked"
      ? "too-many-requests"
      : "unexpected";

/** What an unlock with the server gives: the open account and the ciphertexts it was opened from */
export type Unlock = { opened: Opened; stored: Stored };

/**
 * Signs in with the sign-in key (P-02), loads the ciphertexts and opens them (P-03). A server that
 * does not answer at all is "unreachable": the web app then unlocks from its offline copy (K-308
 * part b, apps/web/src/session/session.ts); the extension has none.
 */
export const signInAndUnlock = async (
  api: Pick<AccountApi, "signIn" | "keys">,
  accountId: Uint8Array,
  passphrase: string,
  secretKey: Uint8Array,
  derive?: Derive,
): Promise<Outcome<Unlock>> => {
  const signedIn = await api.signIn(accountId, passphrase, secretKey, derive);
  if (!signedIn.ok)
    return {
      ok: false,
      error: signedIn.error === "unreachable" ? "unreachable" : signInError(signedIn.error),
    };
  const stored = await api.keys(signedIn.token);
  if (!stored) return { ok: false, error: "unexpected" };
  const unlocked = unlockWithPassphrase(stored, passphrase, secretKey, derive);
  if (!unlocked.ok)
    return { ok: false, error: unlocked.error === "wrong-key" ? "wrong-passphrase" : "unexpected" };
  return {
    ok: true,
    value: { opened: { ...unlocked.value, accountId, token: signedIn.token }, stored },
  };
};
