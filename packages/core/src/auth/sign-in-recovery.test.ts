import { ed25519KeyPair, recoveryLoginSeed, verify } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import {
  answerChallenge,
  answerRecoveryChallenge,
  type Post,
  recoveryLoginKeyPair,
  signInWithRecoveryKey,
} from "./sign-in.ts";

// P-12: who forgot the passphrase signs in with the key the Recovery Key gives
const anna = new Uint8Array(16).fill(0x20);
const recoveryKey = new Uint8Array(32).fill(9);
const challenge = new Uint8Array(32).fill(5);

/** Checks like apps/server: the recovery way, purpose login-recovery, the account's recovery key */
const server = (
  accountId: Uint8Array,
  key: Uint8Array,
  status?: number,
): { post: Post; sent: unknown[] } => {
  const { publicKey } = recoveryLoginKeyPair(key, accountId);
  const sent: unknown[] = [];
  const post: Post = async (path, body) => {
    sent.push([path, body]);
    if (path === "/auth/login-key/challenge")
      return {
        status: 200,
        json: {
          challengeId: "c1",
          challenge: encodeBytes(challenge),
          accountSalt: encodeBytes(new Uint8Array(16)),
        },
      };
    const { signature } = body as { signature: string };
    const ok = verify(
      publicKey,
      bytes(65).parse(signature),
      "login-recovery",
      encodeBytes(accountId),
      challenge,
    );
    if (status) return { status, json: {} };
    return ok ? { status: 200, json: { token: "t" } } : { status: 401, json: { error: "denied" } };
  };
  return { post, sent };
};

describe("signInWithRecoveryKey", () => {
  it("asks for a recovery challenge and signs it with the Recovery Key's key", async () => {
    const { post, sent } = server(anna, recoveryKey);
    expect(await signInWithRecoveryKey(post, anna, recoveryKey)).toEqual({ ok: true, token: "t" });
    expect(sent[0]).toEqual([
      "/auth/login-key/challenge",
      { accountId: encodeBytes(anna), way: "recovery" },
    ]);
    expect(Object.keys((sent[1] as [string, object])[1]).sort()).toEqual([
      "challengeId",
      "signature",
    ]);
  });

  it("is denied with another Recovery Key or for another account", async () => {
    expect(
      await signInWithRecoveryKey(server(anna, recoveryKey).post, anna, new Uint8Array(32).fill(8)),
    ).toEqual({
      ok: false,
      error: "denied",
    });
    expect(
      await signInWithRecoveryKey(
        server(anna, recoveryKey).post,
        new Uint8Array(16).fill(1),
        recoveryKey,
      ),
    ).toEqual({ ok: false, error: "denied" });
  });

  it("names the server's refusals", async () => {
    expect(
      await signInWithRecoveryKey(server(anna, recoveryKey, 423).post, anna, recoveryKey),
    ).toEqual({
      ok: false,
      error: "locked",
    });
  });
});

describe("the recovery key pair and its answer", () => {
  it("is the Ed25519 key of the recovery seed, bound to the account", () => {
    expect(recoveryLoginKeyPair(recoveryKey, anna)).toEqual(
      ed25519KeyPair(recoveryLoginSeed(recoveryKey, anna)),
    );
  });

  it("signs for purpose login-recovery, never for login", () => {
    const { secretKey, publicKey } = recoveryLoginKeyPair(recoveryKey, anna);
    const signature = answerRecoveryChallenge(secretKey, "anna", challenge);
    expect(verify(publicKey, signature, "login-recovery", "anna", challenge)).toBe(true);
    expect(verify(publicKey, signature, "login", "anna", challenge)).toBe(false);
    expect(
      verify(
        publicKey,
        answerChallenge(secretKey, "anna", challenge),
        "login-recovery",
        "anna",
        challenge,
      ),
    ).toBe(false);
  });
});
