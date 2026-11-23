/**
 * Unlocking with a passkey (K-707, docs/sicherheitsdesign.md P-03): set up while unlocked, the
 * passkey is registered with Better Auth (WebAuthn, with the PRF extension for its own random
 * salt), AK is sealed under the key its PRF output gives, the server keeps only that sealed AK,
 * and the account state names the passkey. Unlocking signs in with the same passkey and opens AK
 * with the PRF output of that one ceremony. The PRF output never leaves the device: it is not in
 * any request, it is overwritten once used. An authenticator without PRF leaves nothing behind on
 * the server.
 */
import {
  addPasskey,
  bytes,
  encodeBytes,
  newPasskeySalt,
  PASSKEY_SALT_LENGTH,
  removePasskey,
  type Stored,
  sealPasskeyUnlock,
  unlockWithPasskey,
} from "@kennwort/core";
import { constantTimeEqual } from "@kennwort/crypto";
import type { Call } from "./api.ts";
import type { OpenAccount } from "./open-account.ts";
import type { StateDeps } from "./state-sync.ts";
import type { Unlock } from "./unlock.ts";
import {
  creationOptions,
  credentialJson,
  fromBase64Url,
  type PublicKeyCredentialLike,
  prfOutput,
  requestOptions,
} from "./webauthn-json.ts";

/** navigator.credentials, passed in */
export type WebAuthn = {
  create: (options: CredentialCreationOptions) => Promise<unknown>;
  get: (options: CredentialRequestOptions) => Promise<unknown>;
};

export type PasskeyDeps = {
  call: Call;
  api: StateDeps;
  webAuthn: WebAuthn;
  /** Random bytes for the salt; only tests pass fixed ones */
  random?: ((length: number) => Uint8Array) | undefined;
  now?: (() => number) | undefined;
};

/** What the device remembers to offer the passkey: none of it is secret (apps/web device.ts) */
export type PasskeyDevice = { accountId: string; credentialId: string; salt: string };

export type PasskeyError =
  | "no-prf"
  | "cancelled"
  | "wrong-passkey"
  | "passkey-removed"
  | "unreachable"
  | "unexpected";
type Outcome<T> = { ok: true; value: T } | { ok: false; error: PasskeyError };

const ok = <T>(value: T) => ({ ok: true as const, value });
const fail = (error: PasskeyError) => ({ ok: false as const, error });
const failed = (status: number) => fail(status === 0 ? "unreachable" : "unexpected");

const isCredential = (value: unknown): value is PublicKeyCredentialLike =>
  typeof value === "object" &&
  value !== null &&
  (value as { rawId?: unknown }).rawId instanceof ArrayBuffer &&
  typeof (value as { getClientExtensionResults?: unknown }).getClientExtensionResults ===
    "function";

/** A WebAuthn ceremony; the person closing the browser's dialog is "cancelled" */
const ceremony = async (run: () => Promise<unknown>): Promise<Outcome<PublicKeyCredentialLike>> => {
  try {
    const value = await run();
    return isCredential(value) ? ok(value) : fail("unexpected");
  } catch (error) {
    return fail(
      error instanceof Error && error.name === "NotAllowedError" ? "cancelled" : "no-prf",
    );
  }
};

/** The PRF output of a registration that only enabled it: one more ceremony for this passkey */
const evaluate = async (deps: PasskeyDeps, credentialId: Uint8Array, salt: Uint8Array) => {
  const challenge = (deps.random ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n))))(32);
  const options = requestOptions({ challenge: encodeBytes(challenge) }, credentialId, salt);
  const asserted = options ? await ceremony(() => deps.webAuthn.get(options)) : fail("unexpected");
  return asserted.ok ? prfOutput(asserted.value) : undefined;
};

/** The PRF output of a new passkey, or undefined when the authenticator has no PRF */
const prfOfNew = async (deps: PasskeyDeps, created: PublicKeyCredentialLike, salt: Uint8Array) => {
  const now = prfOutput(created);
  if (now) return now;
  const enabled = created.getClientExtensionResults().prf?.enabled === true;
  return enabled ? evaluate(deps, new Uint8Array(created.rawId), salt) : undefined;
};

const removeOnServer = (deps: PasskeyDeps, credentialId: string, token: string) =>
  deps.call("DELETE", `/api/account/unlock-passkeys/${credentialId}`, undefined, token);

/**
 * Sets up a passkey to unlock the open account. Nothing reaches the server before the
 * authenticator gave a PRF output; a step that fails later takes the passkey back.
 */
export const setUpPasskeyUnlock = async (
  deps: PasskeyDeps,
  account: OpenAccount,
): Promise<Outcome<PasskeyDevice>> => {
  const opened = account.opened();
  if (!opened?.token) return fail("unreachable");
  const { token } = opened;
  const salt = newPasskeySalt(deps.random);
  const asked = await deps.call("GET", "/auth/passkey/generate-register-options", undefined, token);
  const options = asked.status === 200 ? creationOptions(asked.json, salt) : undefined;
  if (!options) return failed(asked.status);
  const created = await ceremony(() => deps.webAuthn.create(options));
  if (!created.ok) return created;
  const prf = await prfOfNew(deps, created.value, salt);
  if (!prf) return fail("no-prf");
  const rawId = new Uint8Array(created.value.rawId);
  const credentialId = encodeBytes(rawId);
  const verified = await deps.call(
    "POST",
    "/auth/passkey/verify-registration",
    { response: credentialJson(created.value), name: "Kennwort" },
    token,
  );
  if (verified.status !== 200) {
    prf.fill(0);
    return failed(verified.status);
  }
  const sealed = sealPasskeyUnlock(prf, salt, rawId, opened.accountKey, opened.accountId);
  prf.fill(0);
  const put = await deps.call(
    "PUT",
    "/api/account/unlock-passkeys",
    { credentialId, sealed: encodeBytes(sealed) },
    token,
  );
  const named =
    put.status === 201
      ? await account.updateState(deps.api, (state) => {
          const passkeys = addPasskey(state.passkeys, rawId, salt, (deps.now ?? Date.now)());
          return passkeys && { ...state, passkeys };
        })
      : undefined;
  if (!named?.ok) {
    await removeOnServer(deps, credentialId, token);
    return failed(put.status === 201 ? 500 : put.status);
  }
  return ok({ accountId: encodeBytes(opened.accountId), credentialId, salt: encodeBytes(salt) });
};

/** The remembered passkey as bytes; undefined if the device's memory is not well-formed */
const deviceBytes = (device: PasskeyDevice) => {
  const accountId = bytes(16).safeParse(device.accountId);
  const credentialId = fromBase64Url(device.credentialId);
  const salt = bytes(PASSKEY_SALT_LENGTH).safeParse(device.salt);
  return accountId.success && credentialId && credentialId.length > 0 && salt.success
    ? { accountId: accountId.data, credentialId, salt: salt.data }
    : undefined;
};

const sessionToken = (json: unknown) => {
  const token = (json as { session?: { token?: unknown } } | undefined)?.session?.token;
  return typeof token === "string" && token.length > 0 ? token : undefined;
};

/** Opens the account from its ciphertexts with the PRF output, which is overwritten after */
const openWith = (
  stored: Stored | undefined,
  wanted: NonNullable<ReturnType<typeof deviceBytes>>,
  prf: Uint8Array,
  token: string,
): Outcome<Unlock> => {
  try {
    if (!stored || !constantTimeEqual(stored.accountId, wanted.accountId))
      return fail("unexpected");
    const unlocked = unlockWithPasskey(stored, wanted.credentialId, wanted.salt, prf);
    if (unlocked.ok)
      return ok({ opened: { ...unlocked.value, accountId: wanted.accountId, token }, stored });
    return fail(
      unlocked.error === "wrong-key"
        ? "wrong-passkey"
        : unlocked.error === "damaged"
          ? "unexpected"
          : "passkey-removed",
    );
  } finally {
    prf.fill(0);
  }
};

/**
 * Signs in with the passkey this device remembers (Better Auth) and opens the account with the
 * PRF output of the same ceremony
 */
export const unlockWithPasskeyOnline = async (
  deps: PasskeyDeps,
  device: PasskeyDevice,
): Promise<Outcome<Unlock>> => {
  const wanted = deviceBytes(device);
  if (!wanted) return fail("unexpected");
  const asked = await deps.call("GET", "/auth/passkey/generate-authenticate-options");
  const options =
    asked.status === 200 ? requestOptions(asked.json, wanted.credentialId, wanted.salt) : undefined;
  if (!options) return failed(asked.status);
  const asserted = await ceremony(() => deps.webAuthn.get(options));
  if (!asserted.ok) return asserted;
  const prf = prfOutput(asserted.value);
  if (!prf) return fail("no-prf");
  const verified = await deps.call("POST", "/auth/passkey/verify-authentication", {
    response: credentialJson(asserted.value),
  });
  const token = verified.status === 200 ? sessionToken(verified.json) : undefined;
  if (!token) {
    prf.fill(0);
    return fail(verified.status === 0 ? "unreachable" : "wrong-passkey");
  }
  return openWith(await deps.api.keys(token), wanted, prf, token);
};

/**
 * Removes a passkey: first from the account state, so no device takes it any more whatever the
 * server keeps, then from the server with its sealed AK
 */
export const removePasskeyUnlock = async (
  deps: PasskeyDeps,
  account: OpenAccount,
  credentialIdText: string,
): Promise<Outcome<true>> => {
  const opened = account.opened();
  const credentialId = fromBase64Url(credentialIdText);
  if (!opened?.token || !credentialId) return fail("unexpected");
  const named = await account.updateState(deps.api, (state) => {
    const passkeys = removePasskey(state.passkeys, credentialId);
    return passkeys && { ...state, passkeys };
  });
  if (!named.ok) return fail(named.error === "unreachable" ? "unreachable" : "unexpected");
  const removed = await removeOnServer(deps, credentialIdText, opened.token);
  return removed.status === 200 || removed.status === 404 ? ok(true) : failed(removed.status);
};
