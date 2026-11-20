/**
 * The client's side of the notweg sign-in (docs/sicherheitsdesign.md, P-02): from passphrase and
 * Secret Key the device derives the Ed25519 sign-in key (F-05) and answers the server's challenge.
 * What goes over the wire is the account ID, the public key at enrolment and one signature per
 * sign-in; the passphrase, Secret Key and every key derived from them stay on the device. Who forgot
 * the passphrase signs in with the key the Recovery Key gives (P-12), under a purpose of its own.
 */
import { ed25519KeyPair, passphraseKeys, recoveryLoginSeed, sign } from "@kennwort/crypto";
import { z } from "zod";
import { bytes, encodeBytes } from "../sync/bytes.ts";

export type Post = (path: string, body: unknown) => Promise<{ status: number; json: unknown }>;
export type Derive = typeof passphraseKeys;

/** The sign-in key pair of an account, derived with its 16-byte ID as F-05 says (`konto-ID`) */
export const loginKeyPair = (
  passphrase: string,
  accountSalt: Uint8Array,
  secretKey: Uint8Array,
  accountId: Uint8Array,
  derive: Derive = passphraseKeys,
) => ed25519KeyPair(derive(passphrase, accountSalt, secretKey, accountId).login);

/** The sign-in key pair the Recovery Key gives (P-12) */
export const recoveryLoginKeyPair = (recoveryKey: Uint8Array, accountId: Uint8Array) =>
  ed25519KeyPair(recoveryLoginSeed(recoveryKey, accountId));

/** The signature that answers a challenge; bound to its purpose, the account and the challenge */
export const answerChallenge = (secretKey: Uint8Array, accountId: string, challenge: Uint8Array) =>
  sign(secretKey, "login", accountId, challenge);

/** The same for the Recovery Key's sign-in key: its own purpose, so it never counts as the other */
export const answerRecoveryChallenge = (
  secretKey: Uint8Array,
  accountId: string,
  challenge: Uint8Array,
) => sign(secretKey, "login-recovery", accountId, challenge);

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

type Answer = (challenge: z.infer<typeof Challenge>, wireId: string) => Uint8Array;

/** Challenge, signature, token: the same for both ways, only the key and purpose differ */
const signIn = async (
  post: Post,
  accountId: Uint8Array,
  way: "passphrase" | "recovery",
  answer: Answer,
): Promise<SignInResult> => {
  // On the wire and in the signature the ID is its base64url text, as the server keeps it
  const wireId = encodeBytes(accountId);
  const started = await post("/auth/login-key/challenge", { accountId: wireId, way });
  const challenge = Challenge.safeParse(started.json);
  if (started.status !== 200 || !challenge.success) return failure(started.status);
  const verified = await post("/auth/login-key/verify", {
    challengeId: challenge.data.challengeId,
    signature: encodeBytes(answer(challenge.data, wireId)),
  });
  const token = Token.safeParse(verified.json);
  return verified.status === 200 && token.success
    ? { ok: true, token: token.data.token }
    : failure(verified.status);
};

export const signInWithPassphrase = (
  post: Post,
  accountId: Uint8Array,
  passphrase: string,
  secretKey: Uint8Array,
  derive: Derive = passphraseKeys,
): Promise<SignInResult> =>
  signIn(post, accountId, "passphrase", (challenge, wireId) => {
    const keys = loginKeyPair(passphrase, challenge.accountSalt, secretKey, accountId, derive);
    return answerChallenge(keys.secretKey, wireId, challenge.challenge);
  });

/** Signing in without the passphrase, with the Recovery Key alone (P-12) */
export const signInWithRecoveryKey = (
  post: Post,
  accountId: Uint8Array,
  recoveryKey: Uint8Array,
): Promise<SignInResult> =>
  signIn(post, accountId, "recovery", (challenge, wireId) =>
    answerRecoveryChallenge(
      recoveryLoginKeyPair(recoveryKey, accountId).secretKey,
      wireId,
      challenge.challenge,
    ),
  );
