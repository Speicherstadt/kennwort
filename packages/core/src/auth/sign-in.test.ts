import { passphraseKeysWith, verify } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import {
  answerChallenge,
  type Derive,
  loginKeyPair,
  type Post,
  signInWithPassphrase,
} from "./sign-in.ts";

const quick: Derive = (p, salt, key, account) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const salt = new Uint8Array(16).fill(3);
const secretKey = new Uint8Array(16).fill(7);
const challenge = new Uint8Array(32).fill(5);

/** A server stand-in that checks the signature like apps/server does */
const anna = new Uint8Array(16).fill(0x20);
const max = new Uint8Array(16).fill(0x30);

const server = (
  accountId: Uint8Array,
  passphrase: string,
  verifyStatus?: number,
  token = "session-token",
): Post => {
  const { publicKey } = loginKeyPair(passphrase, salt, secretKey, accountId, quick);
  return async (path, body) => {
    if (path === "/auth/login-key/challenge")
      return {
        status: 200,
        json: {
          challengeId: "c1",
          challenge: encodeBytes(challenge),
          accountSalt: encodeBytes(salt),
        },
      };
    if (path !== "/auth/login-key/verify") return { status: 404, json: {} };
    const { signature } = body as { signature: string };
    const ok = verify(
      publicKey,
      bytes(65).parse(signature),
      "login",
      encodeBytes(accountId),
      challenge,
    );
    if (verifyStatus) return { status: verifyStatus, json: { token } };
    return ok ? { status: 200, json: { token } } : { status: 401, json: { error: "denied" } };
  };
};

describe("signInWithPassphrase", () => {
  it("answers the challenge with a signature for purpose login, account and challenge", async () => {
    expect(
      await signInWithPassphrase(server(anna, "richtig"), anna, "richtig", secretKey, quick),
    ).toEqual({
      ok: true,
      token: "session-token",
    });
  });

  it("is denied for another passphrase or account", async () => {
    expect(
      await signInWithPassphrase(server(anna, "richtig"), anna, "falsch", secretKey, quick),
    ).toEqual({
      ok: false,
      error: "denied",
    });
    expect(
      await signInWithPassphrase(server(anna, "richtig"), max, "richtig", secretKey, quick),
    ).toEqual({
      ok: false,
      error: "denied",
    });
  });

  it.each([
    [423, "locked"],
    [429, "too-many-requests"],
    [401, "denied"],
    [500, "unexpected"],
  ])("names a %i from the server as %s", async (status, error) => {
    expect(
      await signInWithPassphrase(
        server(anna, "richtig", status),
        anna,
        "richtig",
        secretKey,
        quick,
      ),
    ).toEqual({
      ok: false,
      error,
    });
  });

  it("refuses an answer without a token, or a challenge it cannot read", async () => {
    expect(
      await signInWithPassphrase(
        server(anna, "richtig", undefined, ""),
        anna,
        "richtig",
        secretKey,
        quick,
      ),
    ).toEqual({
      ok: false,
      error: "unexpected",
    });
    const brokenChallenge: Post = async () => ({
      status: 200,
      json: { challengeId: "c1", challenge: "AAAA" },
    });
    expect(await signInWithPassphrase(brokenChallenge, anna, "richtig", secretKey, quick)).toEqual({
      ok: false,
      error: "unexpected",
    });
    const limited: Post = async (path) =>
      path === "/auth/login-key/challenge"
        ? {
            status: 429,
            json: {
              challengeId: "c1",
              challenge: encodeBytes(challenge),
              accountSalt: encodeBytes(salt),
            },
          }
        : { status: 200, json: { token: "session-token" } };
    expect(await signInWithPassphrase(limited, anna, "richtig", secretKey, quick)).toEqual({
      ok: false,
      error: "too-many-requests",
    });
  });

  it("sends the account ID first and then only the challenge ID and signature", async () => {
    const sent: unknown[] = [];
    const post = server(anna, "richtig");
    await signInWithPassphrase(
      async (path, body) => {
        sent.push([path, body]);
        return post(path, body);
      },
      anna,
      "richtig",
      secretKey,
      quick,
    );
    expect(sent[0]).toEqual(["/auth/login-key/challenge", { accountId: encodeBytes(anna) }]);
    expect(Object.keys((sent[1] as [string, object])[1]).sort()).toEqual([
      "challengeId",
      "signature",
    ]);
  });
});

describe("loginKeyPair", () => {
  it("is the Ed25519 key of F-05's login key, bound to the account", () => {
    const keys = loginKeyPair("richtig", salt, secretKey, anna, quick);
    expect(keys.publicKey).toEqual(loginKeyPair("richtig", salt, secretKey, anna, quick).publicKey);
    expect(keys.publicKey).not.toEqual(
      loginKeyPair("richtig", salt, secretKey, max, quick).publicKey,
    );
    const signature = answerChallenge(keys.secretKey, encodeBytes(anna), challenge);
    expect(verify(keys.publicKey, signature, "login", encodeBytes(anna), challenge)).toBe(true);
  });
});
