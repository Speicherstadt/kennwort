import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createFakeIdp, type FakeIdp } from "../testing/fake-idp.ts";
import { type Jwks, MAX_AGE_SECONDS, verifyIdToken } from "./jwt.ts";

const ISSUER = "https://idp.weber-haustechnik.test";
const CLIENT = "kennwort";
const NOW = 1_800_000_000;
const expected = { issuer: ISSUER, clientId: CLIENT, nonce: "n-123", now: NOW };

const b64 = (data: string | Uint8Array) =>
  Buffer.from(typeof data === "string" ? data : Buffer.from(data)).toString("base64url");

const claims = (extra: Record<string, unknown> = {}) => ({
  iss: ISSUER,
  sub: "anna",
  aud: CLIENT,
  exp: NOW + 300,
  iat: NOW,
  nonce: "n-123",
  name: "Anna Weber",
  email: "anna@weber.test",
  ...extra,
});

let idp: FakeIdp;
let jwks: Jwks;
const keys = async () => jwks;

beforeAll(async () => {
  idp = await createFakeIdp({ issuer: ISSUER, clientId: CLIENT, clientSecret: "s" });
  jwks = { keys: [idp.publicJwk as Jwks["keys"][number]] };
});

const signed = (body: Record<string, unknown>) => {
  idp.state.tamper = undefined;
  return idp.signToken(body);
};

describe("verifyIdToken", () => {
  it("takes a token signed by the provider's key for this client and login", async () => {
    const result = await verifyIdToken(await signed(claims()), keys, expected);
    expect(result).toEqual({
      ok: true,
      value: {
        issuer: ISSUER,
        subject: "anna",
        name: "Anna Weber",
        claims: expect.objectContaining({ email: "anna@weber.test" }),
      },
    });
  });

  it.each([
    ["another issuer", { iss: "https://evil.test" }, "issuer"],
    ["the issuer with a trailing slash", { iss: `${ISSUER}/` }, "issuer"],
    ["another audience", { aud: "other-app" }, "audience"],
    ["several audiences without azp", { aud: [CLIENT, "other"] }, "audience"],
    ["several audiences with another azp", { aud: [CLIENT, "other"], azp: "other" }, "audience"],
    ["an azp of another client", { azp: "other" }, "audience"],
    ["an expired token", { exp: NOW - 61 }, "expired"],
    ["a token from the future", { iat: NOW + 61 }, "issued-at"],
    ["a token issued long ago", { iat: NOW - MAX_AGE_SECONDS - 1 }, "issued-at"],
    ["another nonce", { nonce: "n-999" }, "nonce"],
    ["no nonce", { nonce: undefined }, "nonce"],
  ])("refuses %s", async (_, change, error) => {
    const result = await verifyIdToken(await signed(claims(change)), keys, expected);
    expect(result).toEqual({ ok: false, error });
  });

  it("takes several audiences when azp names this client, and the clock skew", async () => {
    const body = claims({ aud: [CLIENT, "other"], azp: CLIENT, exp: NOW - 30, iat: NOW + 30 });
    expect((await verifyIdToken(await signed(body), keys, expected)).ok).toBe(true);
  });

  it("refuses a changed claim under the old signature", async () => {
    const token = await signed(claims());
    const [header, , signature] = token.split(".");
    const forged = `${header}.${b64(JSON.stringify(claims({ sub: "jonas" })))}.${signature}`;
    expect(await verifyIdToken(forged, keys, expected)).toEqual({ ok: false, error: "signature" });
  });

  it("refuses alg none, even without a signature", async () => {
    const none = `${b64(JSON.stringify({ alg: "none" }))}.${b64(JSON.stringify(claims()))}.`;
    expect(await verifyIdToken(none, keys, expected)).toEqual({ ok: false, error: "algorithm" });
  });

  it("refuses HS256 keyed with the public key (alg confusion)", async () => {
    const header = b64(JSON.stringify({ alg: "HS256", kid: "fake-1" }));
    const body = b64(JSON.stringify(claims()));
    const mac = createHmac("sha256", JSON.stringify(idp.publicJwk))
      .update(`${header}.${body}`)
      .digest("base64url");
    expect(await verifyIdToken(`${header}.${body}.${mac}`, keys, expected)).toEqual({
      ok: false,
      error: "algorithm",
    });
  });

  it("refuses an RS256 key used for ES256 and a critical header", async () => {
    idp.state.tamper = { header: (h) => ({ ...h, alg: "ES256" }) };
    const es = await idp.signToken(claims());
    expect(await verifyIdToken(es, keys, expected)).toEqual({ ok: false, error: "unknown-key" });
    idp.state.tamper = { header: (h) => ({ ...h, crit: ["exp"] }) };
    const crit = await idp.signToken(claims());
    expect(await verifyIdToken(crit, keys, expected)).toEqual({ ok: false, error: "algorithm" });
  });

  it("asks for fresh keys once on an unknown kid, then refuses", async () => {
    idp.state.tamper = { header: (h) => ({ ...h, kid: "rotated" }) };
    const token = await idp.signToken(claims());
    const asked: boolean[] = [];
    const result = await verifyIdToken(
      token,
      async (fresh) => {
        asked.push(fresh);
        return jwks;
      },
      expected,
    );
    expect(result).toEqual({ ok: false, error: "unknown-key" });
    expect(asked).toEqual([false, true]);
  });

  it("finds a rotated key in the fresh JWKS", async () => {
    const token = await signed(claims());
    const result = await verifyIdToken(
      token,
      async (fresh) => (fresh ? jwks : { keys: [] }),
      expected,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a key meant for encryption or another algorithm", async () => {
    const token = await signed(claims());
    for (const change of [{ use: "enc" }, { alg: "PS256" }]) {
      const other = { keys: [{ ...idp.publicJwk, ...change }] } as Jwks;
      expect(await verifyIdToken(token, async () => other, expected)).toEqual({
        ok: false,
        error: "unknown-key",
      });
    }
  });

  it.each([
    ["two parts", "a.b"],
    ["a header that is no JSON", `${b64("{")}.${b64("{}")}.`],
    ["claims without sub", `${b64('{"alg":"RS256"}')}.${b64('{"iss":"x"}')}.AA`],
    ["a signature that is no base64url", `${b64('{"alg":"RS256"}')}.${b64("{}")}.+/=`],
  ])("refuses %s as malformed", async (_, token) => {
    expect(await verifyIdToken(token, keys, expected)).toEqual({ ok: false, error: "malformed" });
  });

  it("verifies ES256 and EdDSA with keys of their own type", async () => {
    for (const [alg, params, sign] of [
      [
        "ES256",
        { name: "ECDSA", namedCurve: "P-256" },
        { name: "ECDSA", hash: "SHA-256" },
      ] as const,
      ["EdDSA", { name: "Ed25519" }, { name: "Ed25519" }] as const,
    ]) {
      const pair = (await crypto.subtle.generateKey(params as EcKeyGenParams, true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      // Bun names the Ed25519 key's algorithm "Ed25519" (RFC 9864); this JWS says EdDSA
      const { alg: _alg, ...jwk } = await crypto.subtle.exportKey("jwk", pair.publicKey);
      const own = { keys: [{ ...jwk, kid: "k", kty: jwk.kty ?? "" }] } as Jwks;
      const head = `${b64(JSON.stringify({ alg, kid: "k" }))}.${b64(JSON.stringify(claims()))}`;
      const sig = await crypto.subtle.sign(sign, pair.privateKey, new TextEncoder().encode(head));
      const token = `${head}.${b64(new Uint8Array(sig))}`;
      expect((await verifyIdToken(token, async () => own, expected)).ok).toBe(true);
    }
  });
});
