import {
  type Derive,
  encodeBytes,
  loginKeyPair,
  type Post,
  signInWithPassphrase,
} from "@kennwort/core";
import { passphraseKeys, passphraseKeysWith } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { invitationBody, signInSetup } from "../testing/sign-in-setup.ts";
import { INVITATION_MS } from "./invitations.ts";
import { LOCKOUT } from "./limits.ts";

// Small Argon2id parameters keep the tests quick; one test below uses the real ones
const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);

const secretKey = new Uint8Array(16).fill(7);
const accountSalt = new Uint8Array(16).fill(3);
const PASSPHRASE = "Weber Haustechnik Büro 2026";

const postFor =
  (setup: Awaited<ReturnType<typeof signInSetup>>, seen?: string[]): Post =>
  async (path, body) => {
    seen?.push(JSON.stringify(body));
    const response = await setup.request(path, { body });
    return { status: response.status, json: await response.json() };
  };

/** Jonas invites, Anna's device picks its account ID, derives its sign-in key and accepts */
const invitedAnna = async (
  setup: Awaited<ReturnType<typeof signInSetup>>,
  derive: Derive = quick,
) => {
  const jonas = await setup.member("weber", "owner");
  const created = await setup.request("/api/invitations", {
    method: "POST",
    token: jonas.token,
    body: invitationBody(),
  });
  const invite = (await created.json()) as { id: string; token: string };
  const id = crypto.getRandomValues(new Uint8Array(16));
  const accountId = encodeBytes(id);
  const keys = loginKeyPair(PASSPHRASE, accountSalt, secretKey, id, derive);
  const body = {
    token: invite.token,
    accountId,
    loginPublicKey: encodeBytes(keys.publicKey),
    accountSalt: encodeBytes(accountSalt),
  };
  const accepted = await setup.request(`/auth/invitations/${invite.id}/accept`, { body });
  return { jonas, invite, accepted, accountId, id, body };
};

describe("invitations (P-08)", () => {
  it("let an owner invite, and the invitee join the company with a session", async () => {
    const setup = await signInSetup();
    const { accepted } = await invitedAnna(setup);
    expect(accepted.status).toBe(201);
    const { token } = (await accepted.json()) as { token: string };
    const company = await setup.request("/api/company", { token });
    expect(await company.json()).toMatchObject({ id: "weber" });
  });

  it("work once, only with their token and only until they expire", async () => {
    const setup = await signInSetup();
    const { invite, body: used } = await invitedAnna(setup);
    const body = { ...used, accountId: encodeBytes(new Uint8Array(16).fill(9)) };
    expect((await setup.request(`/auth/invitations/${invite.id}/accept`, { body })).status).toBe(
      410,
    );

    const jonas = await setup.member("weber", "admin");
    const fresh = (await (
      await setup.request("/api/invitations", {
        method: "POST",
        token: jonas.token,
        body: invitationBody(),
      })
    ).json()) as {
      id: string;
      token: string;
    };
    const wrong = { ...body, token: `${fresh.token}x` };
    expect(
      (await setup.request(`/auth/invitations/${fresh.id}/accept`, { body: wrong })).status,
    ).toBe(410);
    setup.clock.advance(INVITATION_MS);
    expect(
      (
        await setup.request(`/auth/invitations/${fresh.id}/accept`, {
          body: { ...body, token: fresh.token },
        })
      ).status,
    ).toBe(410);
    expect((await setup.request("/auth/invitations/nothing/accept", { body })).status).toBe(410);
  });

  it("can be created by owners and admins only", async () => {
    const setup = await signInSetup();
    const max = await setup.member("weber", "member");
    expect(
      (
        await setup.request("/api/invitations", {
          method: "POST",
          token: max.token,
          body: invitationBody(),
        })
      ).status,
    ).toBe(403);
    expect((await setup.request("/api/invitations", { method: "POST" })).status).toBe(401);
  });

  it("refuse an account ID that is taken", async () => {
    const setup = await signInSetup();
    const { body } = await invitedAnna(setup);
    const admin = await setup.member("weber", "admin");
    const created = await setup.request("/api/invitations", {
      method: "POST",
      token: admin.token,
      body: invitationBody(),
    });
    const second = (await created.json()) as { id: string; token: string };
    const again = { ...body, token: second.token };
    expect(
      (await setup.request(`/auth/invitations/${second.id}/accept`, { body: again })).status,
    ).toBe(409);
  });

  it("refuse a malformed acceptance", async () => {
    const setup = await signInSetup();
    const { invite } = await invitedAnna(setup);
    expect(
      (
        await setup.request(`/auth/invitations/${invite.id}/accept`, {
          body: { token: invite.token },
        })
      ).status,
    ).toBe(400);
  });
});

const enrolled = async (setup: Awaited<ReturnType<typeof signInSetup>>, derive: Derive = quick) =>
  (await invitedAnna(setup, derive)).id;

describe("sign-in with the passphrase (P-02)", () => {
  it("gives a session for the right passphrase and Secret Key", async () => {
    const setup = await signInSetup();
    const accountId = await enrolled(setup);
    const result = await signInWithPassphrase(
      postFor(setup),
      accountId,
      PASSPHRASE,
      secretKey,
      quick,
    );
    expect(result.ok).toBe(true);
    const token = result.ok ? result.token : "";
    expect((await setup.request("/api/company", { token })).status).toBe(200);
  });

  it("denies a wrong passphrase or Secret Key", async () => {
    const setup = await signInSetup();
    const accountId = await enrolled(setup);
    expect(
      await signInWithPassphrase(postFor(setup), accountId, "falsch", secretKey, quick),
    ).toEqual({ ok: false, error: "denied" });
    expect(
      await signInWithPassphrase(postFor(setup), accountId, PASSPHRASE, new Uint8Array(16), quick),
    ).toEqual({
      ok: false,
      error: "denied",
    });
  });

  it("locks the account after five failures, also for the right passphrase, until the window passed", async () => {
    const setup = await signInSetup();
    const accountId = await enrolled(setup);
    for (let attempt = 0; attempt < LOCKOUT.failures; attempt++)
      await signInWithPassphrase(postFor(setup), accountId, "falsch", secretKey, quick);
    expect(
      await signInWithPassphrase(postFor(setup), accountId, PASSPHRASE, secretKey, quick),
    ).toEqual({ ok: false, error: "locked" });
    setup.clock.advance(LOCKOUT.windowMs);
    expect(
      (await signInWithPassphrase(postFor(setup), accountId, PASSPHRASE, secretKey, quick)).ok,
    ).toBe(true);
  });

  it("forgets the failures after a successful sign-in", async () => {
    const setup = await signInSetup();
    const accountId = await enrolled(setup);
    for (let attempt = 0; attempt < LOCKOUT.failures - 1; attempt++)
      await signInWithPassphrase(postFor(setup), accountId, "falsch", secretKey, quick);
    expect(
      (await signInWithPassphrase(postFor(setup), accountId, PASSPHRASE, secretKey, quick)).ok,
    ).toBe(true);
    await signInWithPassphrase(postFor(setup), accountId, "falsch", secretKey, quick);
    expect(
      (await signInWithPassphrase(postFor(setup), accountId, PASSPHRASE, secretKey, quick)).ok,
    ).toBe(true);
  });

  it("limits the requests per client address", async () => {
    const setup = await signInSetup({ rateLimit: 2 });
    const challenge = () =>
      setup.request("/auth/login-key/challenge", { body: { accountId: "x" }, ip: "203.0.113.7" });
    expect((await challenge()).status).toBe(200);
    expect((await challenge()).status).toBe(200);
    expect((await challenge()).status).toBe(429);
    expect(
      (
        await setup.request("/auth/login-key/challenge", {
          body: { accountId: "x" },
          ip: "203.0.113.8",
        })
      ).status,
    ).toBe(200);
  });

  it("answers an unknown account like a known one, with a stable salt", async () => {
    const setup = await signInSetup();
    const ask = async () =>
      (
        (await (
          await setup.request("/auth/login-key/challenge", { body: { accountId: "niemand" } })
        ).json()) as {
          accountSalt: string;
        }
      ).accountSalt;
    expect(await ask()).toBe(await ask());
    expect(
      await signInWithPassphrase(
        postFor(setup),
        new Uint8Array(16).fill(0x99),
        PASSPHRASE,
        secretKey,
        quick,
      ),
    ).toEqual({ ok: false, error: "denied" });
  });

  it("takes each challenge once and only for two minutes", async () => {
    const setup = await signInSetup();
    const id = await enrolled(setup);
    const accountId = encodeBytes(id);
    const started = (await (
      await setup.request("/auth/login-key/challenge", { body: { accountId } })
    ).json()) as {
      challengeId: string;
      challenge: string;
    };
    const { answerChallenge } = await import("@kennwort/core");
    const { bytes } = await import("@kennwort/core");
    const keys = loginKeyPair(PASSPHRASE, accountSalt, secretKey, id, quick);
    const signature = encodeBytes(
      answerChallenge(keys.secretKey, accountId, bytes(32).parse(started.challenge)),
    );
    const verify = () =>
      setup.request("/auth/login-key/verify", {
        body: { challengeId: started.challengeId, signature },
      });
    expect((await verify()).status).toBe(200);
    expect((await verify()).status).toBe(401);
    const late = (await (
      await setup.request("/auth/login-key/challenge", { body: { accountId } })
    ).json()) as {
      challengeId: string;
    };
    setup.clock.advance(2 * 60 * 1000);
    expect(
      (
        await setup.request("/auth/login-key/verify", {
          body: { challengeId: late.challengeId, signature },
        })
      ).status,
    ).toBe(401);
  });

  it("never sends the passphrase, the Secret Key or a key derived from them (real Argon2id)", async () => {
    const setup = await signInSetup();
    const accountId = await enrolled(setup, passphraseKeys);
    const seen: string[] = [];
    const result = await signInWithPassphrase(
      postFor(setup, seen),
      accountId,
      PASSPHRASE,
      secretKey,
      passphraseKeys,
    );
    expect(result.ok).toBe(true);
    const derived = passphraseKeys(PASSPHRASE, accountSalt, secretKey, accountId);
    const secrets = [
      PASSPHRASE,
      encodeBytes(secretKey),
      encodeBytes(derived.login),
      encodeBytes(derived.unlock),
    ];
    const sent = seen.join("\n");
    for (const secret of secrets) expect(sent).not.toContain(secret);
    expect(sent).not.toContain(Buffer.from(secretKey).toString("hex"));
  });
});

describe("passkeys (Better Auth)", () => {
  it("offer authentication options at /auth/passkey/generate-authenticate-options", async () => {
    const setup = await signInSetup();
    const response = await setup.request("/auth/passkey/generate-authenticate-options", {
      method: "GET",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rpId: "localhost" });
  });

  it("offer registration options only with a session", async () => {
    const setup = await signInSetup();
    expect(
      (await setup.request("/auth/passkey/generate-register-options", { method: "GET" })).status,
    ).toBe(401);
    const jonas = await setup.member("weber", "owner");
    const response = await setup.request("/auth/passkey/generate-register-options", {
      method: "GET",
      token: jonas.token,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rp: { id: "localhost", name: "Kennwort" } });
  });
});
