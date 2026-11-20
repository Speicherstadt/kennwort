/**
 * The calls the web app makes for accounts (K-303): set up a company, accept an invitation,
 * upload and read the account's ciphertexts, sign in with the passphrase or the Recovery Key and
 * replace the unlock ways after it. Only IDs, public keys
 * and ciphertexts go out; every answer is parsed before it is used.
 */
import {
  type AccountUpload,
  type Certificate,
  type Derive,
  encodeBytes,
  type Post,
  SessionWire,
  type Stored,
  StoredWire,
  signInWithPassphrase,
  signInWithRecoveryKey,
  toWire,
  type UnlockUpload,
} from "@kennwort/core";
export type ApiError = "wrong-code" | "invalid-invitation" | "too-many-requests" | "unexpected";
type Answer<T> = { ok: true; value: T } | { ok: false; error: ApiError };

const errorOf = (status: number): ApiError =>
  status === 401
    ? "wrong-code"
    : status === 410
      ? "invalid-invitation"
      : status === 429
        ? "too-many-requests"
        : "unexpected";

const enrolment = (upload: AccountUpload) => ({
  accountId: encodeBytes(upload.accountId),
  loginPublicKey: encodeBytes(upload.loginPublicKey),
  accountSalt: encodeBytes(upload.accountSalt),
});

const keysBody = (upload: AccountUpload, certificate?: Certificate) => ({
  xwingPublicKey: encodeBytes(upload.xwingPublicKey),
  edPublicKey: encodeBytes(upload.edPublicKey),
  keyBlock: encodeBytes(upload.keyBlock),
  unlock: {
    passphrase: encodeBytes(upload.unlock.passphrase),
    recovery: encodeBytes(upload.unlock.recovery),
  },
  recoveryLoginPublicKey: encodeBytes(upload.recoveryLoginPublicKey),
  state: encodeBytes(upload.state),
  stateCounter: upload.stateCounter,
  ...(certificate ? { certificate: toWire(certificate) } : {}),
});

export const createApi = (send: typeof fetch = fetch) => {
  /** Status 0 when the server cannot be reached: errors are values here too (review of K-303) */
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const response = await send(path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch(() => undefined);
    if (!response) return { status: 0, json: undefined };
    return { status: response.status, json: await response.json().catch(() => undefined) };
  };
  const session = (answer: { status: number; json: unknown }): Answer<string> => {
    const parsed = SessionWire.safeParse(answer.json);
    return answer.status === 201 && parsed.success
      ? { ok: true, value: parsed.data.token }
      : { ok: false, error: errorOf(answer.status) };
  };
  const post: Post = (path, body) => call("POST", path, body);
  return {
    setup: async (code: string, companyId: Uint8Array, upload: AccountUpload) =>
      session(
        await call("POST", "/auth/setup", {
          code,
          companyId: encodeBytes(companyId),
          ...enrolment(upload),
        }),
      ),
    accept: async (invitationId: string, token: string, upload: AccountUpload) =>
      session(
        await call("POST", `/auth/invitations/${encodeURIComponent(invitationId)}/accept`, {
          token,
          ...enrolment(upload),
        }),
      ),
    uploadKeys: async (token: string, upload: AccountUpload, certificate?: Certificate) =>
      (await call("PUT", "/api/account/keys", keysBody(upload, certificate), token)).status === 201,
    keys: async (token: string): Promise<Stored | undefined> => {
      const parsed = StoredWire.safeParse(
        (await call("GET", "/api/account/keys", undefined, token)).json,
      );
      return parsed.success ? parsed.data : undefined;
    },
    signIn: (accountId: Uint8Array, passphrase: string, secretKey: Uint8Array, derive?: Derive) =>
      signInWithPassphrase(post, accountId, passphrase, secretKey, derive),
    /** Signing in with the Recovery Key alone (P-12) */
    signInWithRecovery: (accountId: Uint8Array, recoveryKey: Uint8Array) =>
      signInWithRecoveryKey(post, accountId, recoveryKey),
    /** New passphrase and Recovery Key after the old Recovery Key was used */
    replaceUnlock: async (token: string, upload: UnlockUpload) =>
      (
        await call(
          "PUT",
          "/api/account/unlock",
          {
            accountSalt: encodeBytes(upload.accountSalt),
            loginPublicKey: encodeBytes(upload.loginPublicKey),
            recoveryLoginPublicKey: encodeBytes(upload.recoveryLoginPublicKey),
            unlock: {
              passphrase: encodeBytes(upload.unlock.passphrase),
              recovery: encodeBytes(upload.unlock.recovery),
            },
          },
          token,
        )
      ).status === 200,
  };
};

export type Api = ReturnType<typeof createApi>;
