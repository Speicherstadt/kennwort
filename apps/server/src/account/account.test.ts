// K-303, part 1: the first owner sets up the company, an invited member makes an account, both
// unlock on another device with passphrase and Secret Key; the server holds only ciphertexts
import { describe, expect, it } from "bun:test";
import {
  bytes,
  createAccount,
  createCompany,
  emptyState,
  encodeBytes,
  type Stored,
  sealState,
  signInWithPassphrase,
  toWire,
  unlockWithPassphrase,
} from "@kennwort/core";
import { passphraseKeysWith } from "@kennwort/crypto";
import { sql } from "drizzle-orm";
import { companies } from "../db/schema.ts";
import { signInSetup } from "../testing/sign-in-setup.ts";

const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const CODE = "setup-code-of-weber-haustechnik";
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";

type Setup = Awaited<ReturnType<typeof signInSetup>>;
const keysOf = (upload: ReturnType<typeof createAccount>["upload"]) => ({
  xwingPublicKey: encodeBytes(upload.xwingPublicKey),
  edPublicKey: encodeBytes(upload.edPublicKey),
  keyBlock: encodeBytes(upload.keyBlock),
  unlock: {
    passphrase: encodeBytes(upload.unlock.passphrase),
    recovery: encodeBytes(upload.unlock.recovery),
  },
  state: encodeBytes(upload.state),
  stateCounter: 0,
});

const setUp = async (setup: Setup) => {
  const company = createCompany(PASSPHRASE, { derive: quick });
  const { owner } = company;
  const response = await setup.request("/auth/setup", {
    body: {
      code: CODE,
      companyId: encodeBytes(company.companyId),
      accountId: encodeBytes(owner.accountId),
      loginPublicKey: encodeBytes(owner.upload.loginPublicKey),
      accountSalt: encodeBytes(owner.upload.accountSalt),
    },
  });
  return { company, response };
};

/** Signs in on another device the notweg way and reads the account back, as a client would */
const unlockElsewhere = async (
  setup: Setup,
  account: ReturnType<typeof createAccount>,
  passphrase: string,
) => {
  const post = async (path: string, body: unknown) => {
    const response = await setup.request(path, { body });
    return { status: response.status, json: await response.json() };
  };
  const signedIn = await signInWithPassphrase(
    post,
    account.accountId,
    passphrase,
    account.secretKey,
    quick,
  );
  if (!signedIn.ok) return signedIn;
  const keys = (await (
    await setup.request("/api/account/keys", { token: signedIn.token })
  ).json()) as Record<string, unknown>;
  const b = (value: unknown) => bytes().parse(value);
  const unlock = keys.unlock as Record<string, string>;
  const stored: Stored = {
    accountId: b(keys.accountId),
    accountSalt: b(keys.accountSalt),
    keyBlock: b(keys.keyBlock),
    state: b(keys.state),
    stateCounter: keys.stateCounter as number,
    unlock: { passphrase: b(unlock.passphrase), recovery: b(unlock.recovery) },
  };
  return {
    ...unlockWithPassphrase(stored, passphrase, account.secretKey, quick),
    token: signedIn.token,
  };
};

describe("setting up the company", () => {
  it("lets the first owner set up once with the code, upload the keys and unlock on another device", async () => {
    const setup = await signInSetup({ setupCode: CODE, empty: true });
    const { company, response } = await setUp(setup);
    expect(response.status).toBe(201);
    const { token } = (await response.json()) as { token: string };
    const upload = { ...keysOf(company.owner.upload), certificate: toWire(company.certificate) };
    expect(
      (await setup.request("/api/account/keys", { method: "PUT", token, body: upload })).status,
    ).toBe(201);
    expect(
      (await setup.request("/api/account/keys", { method: "PUT", token, body: upload })).status,
    ).toBe(409);
    const unlocked = await unlockElsewhere(setup, company.owner, PASSPHRASE);
    expect(unlocked.ok && unlocked.value.state).toEqual(company.owner.state);
    expect(unlocked.ok && unlocked.value.state.rootSecretKey).toHaveLength(32);
    // The code opens new companies only: a second owner gets a company of their own
    const second = await setUp(setup);
    expect(second.response.status).toBe(201);
    expect(setup.db.select().from(companies).all()).toHaveLength(2);
  });

  it("refuses a wrong code, and any setup on a server without a code", async () => {
    const setup = await signInSetup({ setupCode: CODE, empty: true });
    const company = createCompany(PASSPHRASE, { derive: quick });
    const body = {
      code: "wrong-code-wrong-code",
      companyId: encodeBytes(company.companyId),
      accountId: encodeBytes(company.owner.accountId),
      loginPublicKey: encodeBytes(company.owner.upload.loginPublicKey),
      accountSalt: encodeBytes(company.owner.upload.accountSalt),
    };
    expect((await setup.request("/auth/setup", { body })).status).toBe(401);
    expect((await setup.request("/auth/setup", { body: { ...body, companyId: "x" } })).status).toBe(
      400,
    );
    // 22 characters, but not the canonical text of 16 bytes: one ID has only one spelling
    // The last character of a canonical ID is A, Q, g or w; the next one in the alphabet is not
    const last = body.accountId.at(-1) ?? "A";
    const alias = `${body.accountId.slice(0, 21)}${String.fromCharCode(last.charCodeAt(0) + 1)}`;
    const aliased = { ...body, code: CODE, accountId: alias };
    expect((await setup.request("/auth/setup", { body: aliased })).status).toBe(400);
    const closed = await signInSetup({ empty: true });
    expect((await closed.request("/auth/setup", { body: { ...body, code: CODE } })).status).toBe(
      404,
    );
    const limited = await signInSetup({ setupCode: CODE, empty: true, rateLimit: 1 });
    await limited.request("/auth/setup", { body });
    expect((await limited.request("/auth/setup", { body })).status).toBe(429);
  });

  it("refuses a certificate for another account or other keys", async () => {
    const setup = await signInSetup({ setupCode: CODE, empty: true });
    const { company, response } = await setUp(setup);
    const { token } = (await response.json()) as { token: string };
    const other = createCompany(PASSPHRASE, { derive: quick });
    const upload = { ...keysOf(company.owner.upload), certificate: toWire(other.certificate) };
    expect(
      (await setup.request("/api/account/keys", { method: "PUT", token, body: upload })).status,
    ).toBe(400);
  });
});

describe("an invited member", () => {
  it("makes an account and unlocks it on another device; the state only moves to the next counter", async () => {
    const setup = await signInSetup();
    const jonas = await setup.member("weber", "owner");
    const invite = (await (
      await setup.request("/api/invitations", { method: "POST", token: jonas.token })
    ).json()) as {
      id: string;
      token: string;
    };
    const anna = createAccount("Anna-mag-Kupferrohre", emptyState(new Uint8Array(32).fill(1)), {
      derive: quick,
    });
    const accepted = await setup.request(`/auth/invitations/${invite.id}/accept`, {
      body: {
        token: invite.token,
        accountId: encodeBytes(anna.accountId),
        loginPublicKey: encodeBytes(anna.upload.loginPublicKey),
        accountSalt: encodeBytes(anna.upload.accountSalt),
      },
    });
    const { token } = (await accepted.json()) as { token: string };
    expect(
      (
        await setup.request("/api/account/keys", {
          method: "PUT",
          token,
          body: keysOf(anna.upload),
        })
      ).status,
    ).toBe(201);
    expect(await unlockElsewhere(setup, anna, "falsch")).toEqual({ ok: false, error: "denied" });
    const unlocked = await unlockElsewhere(setup, anna, "Anna-mag-Kupferrohre");
    expect(unlocked.ok && unlocked.value.keyBlock.ed.publicKey).toEqual(anna.keyBlock.ed.publicKey);

    const next = { ...anna.state, versions: { bank: 2 } };
    const write = (counter: number) =>
      setup.request("/api/account/state", {
        method: "PUT",
        token,
        body: {
          state: encodeBytes(sealState(anna.accountKey, anna.accountId, counter, next)),
          stateCounter: counter,
        },
      });
    expect((await write(1)).status).toBe(200);
    const stale = await write(1);
    expect([stale.status, await stale.json()]).toEqual([409, { error: "stale", stateCounter: 1 }]);
    expect((await write(3)).status).toBe(409);
    expect((await write(2)).status).toBe(200);
    const after = await unlockElsewhere(setup, anna, "Anna-mag-Kupferrohre");
    expect(after.ok && after.value.state.versions).toEqual({ bank: 2 });

    // Nothing readable on the server: passphrase, Secret Key, Recovery Key, AK, private keys
    const tables = setup.db.all<{ name: string }>(
      sql`select name from sqlite_master where type = 'table'`,
    );
    const stored = tables.flatMap(({ name }) =>
      setup.db
        .all<Record<string, unknown>>(sql.raw(`select * from "${name}"`))
        .flatMap((row) => Object.values(row)),
    );
    const hay = stored.map((v) =>
      v instanceof Uint8Array ? Buffer.from(v) : Buffer.from(String(v)),
    );
    for (const secret of [
      Buffer.from("Anna-mag-Kupferrohre"),
      Buffer.from(anna.secretKey),
      Buffer.from(anna.recoveryKey),
      Buffer.from(anna.accountKey),
      Buffer.from(anna.keyBlock.ed.secretKey),
      Buffer.from(encodeBytes(anna.secretKey)),
      Buffer.from(encodeBytes(anna.accountKey)),
    ])
      expect(hay.some((h) => h.includes(secret))).toBe(false);
  });

  it("needs a session and finds no keys before they are uploaded", async () => {
    const setup = await signInSetup();
    const max = await setup.member("weber", "member");
    expect((await setup.request("/api/account/keys", { token: max.token })).status).toBe(404);
    expect(
      (
        await setup.request("/api/account/state", {
          method: "PUT",
          token: max.token,
          body: { state: "AAAA", stateCounter: 1 },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await setup.request("/api/account/state", {
          method: "PUT",
          token: max.token,
          body: { stateCounter: 0 },
        })
      ).status,
    ).toBe(400);
    expect(
      (await setup.request("/api/account/keys", { method: "PUT", token: max.token, body: {} }))
        .status,
    ).toBe(400);
    expect((await setup.request("/api/account/keys")).status).toBe(401);
  });
});
