/**
 * The client's side of the notweg sign-in (docs/sicherheitsdesign.md, P-02): from passphrase and
 * Secret Key the device derives the Ed25519 sign-in key (F-05) and answers the server's challenge.
 * What goes over the wire is the account ID, the public key at enrolment and one signature per
 * sign-in; the passphrase, Secret Key and every key derived from them stay on the device.
 */
import { ed25519KeyPair, passphraseKeys, sign } from "@kennwort/crypto";
import { z } from "zod";
import { bytes, encodeBytes } from "../sync/bytes.ts";

export type Post = (path: string, body: unknown) => Promise<{ status: number; json: unknown }>;
export type Derive = typeof passphraseKeys;

/** The sign-in key pair of an account */
export const loginKeyPair = (
  passphrase: string,
  accountSalt: Uint8Array,
  secretKey: Uint8Array,
  accountId: string,
  derive: Derive = passphraseKeys,
) =>
  ed25519KeyPair(
    derive(passphrase, accountSalt, secretKey, new TextEncoder().encode(accountId)).login,
  );

/** The signature that answers a challenge; bound to its purpose, the account and the challenge */
export const answerChallenge = (secretKey: Uint8Array, accountId: string, challenge: Uint8Array) =>
  sign(secretKey, "login", accountId, challenge);

const Challenge = z.object({
  challengeId: z.string(),
  challenge: bytes(32),
  accountSalt: bytes(16),
});
const Token = z.object({ token: z.string().min(1) });

export type SignInResult =
  | { ok: true; token: string }
  | { ok: false; error: "denied" | "locked" | "too-many-requests" | "unexpected" };

const failure = (status: number): SignInResult => ({
  ok: false,
  error:
    status === 423
      ? "locked"
      : status === 429
        ? "too-many-requests"
        : status === 401
          ? "denied"
          : "unexpected",
});

export const signInWithPassphrase = async (
  post: Post,
  accountId: string,
  passphrase: string,
  secretKey: Uint8Array,
  derive: Derive = passphraseKeys,
): Promise<SignInResult> => {
  const started = await post("/auth/login-key/challenge", { accountId });
  const challenge = Challenge.safeParse(started.json);
  if (started.status !== 200 || !challenge.success) return failure(started.status);
  const keys = loginKeyPair(passphrase, challenge.data.accountSalt, secretKey, accountId, derive);
  const signature = answerChallenge(keys.secretKey, accountId, challenge.data.challenge);
  const verified = await post("/auth/login-key/verify", {
    challengeId: challenge.data.challengeId,
    signature: encodeBytes(signature),
  });
  const token = Token.safeParse(verified.json);
  return verified.status === 200 && token.success
    ? { ok: true, token: token.data.token }
    : failure(verified.status);
};
