// K-308 part b: a device that unlocked without the server signs in later with the sign-in key it
// derived then, and tells a server it cannot reach (status 0) apart from one that refuses
import { passphraseKeysWith, verify } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import {
  type Derive,
  loginKeyPair,
  type Post,
  signInWithLoginKey,
  signInWithPassphrase,
} from "./sign-in.ts";

const quick: Derive = (p, salt, key, account) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const salt = new Uint8Array(16).fill(3);
const secretKey = new Uint8Array(16).fill(7);
const challenge = new Uint8Array(32).fill(5);
const anna = new Uint8Array(16).fill(0x20);

const server =
  (publicKey: Uint8Array): Post =>
  async (path, body) => {
    // The way counts on the server: a sign-in key from the passphrase answers as "passphrase"
    if (path === "/auth/login-key/challenge" && (body as { way?: string }).way !== "passphrase")
      return { status: 400, json: {} };
    if (path === "/auth/login-key/challenge")
      return {
        status: 200,
        json: {
          challengeId: "c1",
          challenge: encodeBytes(challenge),
          accountSalt: encodeBytes(salt),
        },
      };
    const { signature } = body as { signature: string };
    const ok = verify(publicKey, bytes(65).parse(signature), "login", encodeBytes(anna), challenge);
    return ok ? { status: 200, json: { token: "t" } } : { status: 401, json: {} };
  };

describe("signing in without the passphrase at hand", () => {
  it("answers the challenge with the sign-in key derived before", async () => {
    const keys = loginKeyPair("richtig", salt, secretKey, anna, quick);
    expect(await signInWithLoginKey(server(keys.publicKey), anna, keys.secretKey)).toEqual({
      ok: true,
      token: "t",
    });
  });

  it("is denied with another key", async () => {
    const keys = loginKeyPair("richtig", salt, secretKey, anna, quick);
    const other = loginKeyPair("falsch", salt, secretKey, anna, quick);
    expect(await signInWithLoginKey(server(keys.publicKey), anna, other.secretKey)).toEqual({
      ok: false,
      error: "denied",
    });
  });

  it("names a server it cannot reach as unreachable, not as unexpected", async () => {
    const away: Post = async () => ({ status: 0, json: undefined });
    expect(await signInWithPassphrase(away, anna, "richtig", secretKey, quick)).toEqual({
      ok: false,
      error: "unreachable",
    });
  });
});
