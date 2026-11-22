// K-307 part c (P-13): the company recovery key, the deposits and how the server keeps them
import { describe, expect, it } from "bun:test";
import {
  CompanyWire,
  changeRole,
  depositToWire,
  encodeBytes,
  grantRecoveryKey,
  HeldDepositWire,
  newCompanyRecoveryKey,
  policyToWire,
  RecoveryBundleWire,
  RecoveryGrantWire,
  recoveryKeyToWire,
  recoveryPolicy,
  signPolicy,
  toWire,
} from "@kennwort/core";
import { depositAccountKey, ed25519KeyPair } from "@kennwort/crypto";
import { eq } from "drizzle-orm";
import { recoveryDeposits, recoveryGrants } from "../db/schema.ts";
import {
  annaDeposits,
  makeRecoveryKey,
  policyOf,
  type WeberWithAnna,
  weberWithAnna,
} from "../testing/recovery-setup.ts";

const company = async (w: WeberWithAnna) =>
  CompanyWire.parse(await (await w.o.setup.request("/api/company", { token: w.o.token })).json());
const deposits = (w: WeberWithAnna) => w.o.setup.db.select().from(recoveryDeposits).all();
const grants = (w: WeberWithAnna) => w.o.setup.db.select().from(recoveryGrants).all();

describe("the company recovery key (P-13)", () => {
  it("is kept with the policy naming it and wrapped to the owner", async () => {
    const w = await weberWithAnna();
    const { key, policy, status } = await makeRecoveryKey(w);
    expect(status).toBe(200);
    const shown = await company(w);
    expect(shown.recoveryPublicKey).toEqual(key.publicKey);
    expect(shown.policy).toEqual(policy);
    const grant = await w.o.setup.request("/api/account/recovery-grant", { token: w.o.token });
    expect(RecoveryGrantWire.parse(await grant.json()).recoveryGrant).toHaveLength(1194);
    expect(
      (await w.o.setup.request("/api/account/recovery-grant", { token: w.annaToken })).status,
    ).toBe(404);
  });

  it("is taken only from an owner, for exactly the owners, with a root-signed policy naming it", async () => {
    const w = await weberWithAnna();
    const key = newCompanyRecoveryKey();
    const policy = recoveryPolicy(
      w.root,
      signPolicy(w.root, {
        companyId: w.o.company.companyId,
        version: 0,
        lockAfterMinutes: 10,
        companyRecovery: { enabled: false },
      }),
      key.fingerprint,
    );
    const jonasGrant = {
      accountId: w.o.owner.accountId,
      grant: grantRecoveryKey(key.secretKey, w.o.company.certificate),
    };
    const annaGrant = {
      accountId: w.anna.accountId,
      grant: grantRecoveryKey(key.secretKey, w.annaCert),
    };
    const put = (body: unknown, token = w.o.token) =>
      w.o.setup.request("/api/company/recovery-key", { method: "PUT", token, body });
    expect(
      (await put(recoveryKeyToWire(policy, key.publicKey, [jonasGrant]), w.annaToken)).status,
    ).toBe(403);
    // a grant for a member, or none for an owner
    expect(
      (await put(recoveryKeyToWire(policy, key.publicKey, [jonasGrant, annaGrant]))).status,
    ).toBe(400);
    expect((await put(recoveryKeyToWire(policy, key.publicKey, [annaGrant]))).status).toBe(400);
    expect(
      (await put(recoveryKeyToWire(policy, key.publicKey, [jonasGrant, jonasGrant]))).status,
    ).toBe(400);
    // a policy naming another key, one with recovery off, one the root did not sign
    const other = newCompanyRecoveryKey();
    expect((await put(recoveryKeyToWire(policy, other.publicKey, [jonasGrant]))).status).toBe(400);
    const off = recoveryPolicy(w.root, policy, undefined);
    expect((await put(recoveryKeyToWire(off, key.publicKey, [jonasGrant]))).status).toBe(400);
    const forged = recoveryPolicy(ed25519KeyPair().secretKey, policy, key.fingerprint);
    expect((await put(recoveryKeyToWire(forged, key.publicKey, [jonasGrant]))).status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect((await company(w)).recoveryPublicKey).toBeNull();
    expect((await put(recoveryKeyToWire(policy, key.publicKey, [jonasGrant]))).status).toBe(200);
    // the same version again is stale
    expect((await put(recoveryKeyToWire(policy, key.publicKey, [jonasGrant]))).status).toBe(409);
  });

  it("drops every deposit and grant of the old key when a new one comes", async () => {
    const w = await weberWithAnna();
    const first = await makeRecoveryKey(w);
    expect((await annaDeposits(w, first.policy, first.key.publicKey)).status).toBe(200);
    expect(deposits(w)).toHaveLength(1);
    const second = await makeRecoveryKey(w);
    expect(second.status).toBe(200);
    expect(deposits(w)).toEqual([]);
    expect(grants(w)).toHaveLength(1);
    expect((await company(w)).recoveryPublicKey).toEqual(second.key.publicKey);
  });
});

describe("the policy with company recovery", () => {
  it("keeps the key for a new lock time, refuses another key, and drops all when recovery goes off", async () => {
    const w = await weberWithAnna();
    const { key, policy } = await makeRecoveryKey(w);
    await annaDeposits(w, policy, key.publicKey);
    const put = (body: unknown) =>
      w.o.setup.request("/api/company/policy", { method: "PUT", token: w.o.token, body });
    const lock = signPolicy(w.root, {
      ...policy,
      version: policy.version + 1,
      lockAfterMinutes: 3,
    });
    expect((await put(policyToWire(lock))).status).toBe(200);
    expect(deposits(w)).toHaveLength(1);
    const other = recoveryPolicy(w.root, lock, newCompanyRecoveryKey().fingerprint);
    expect((await put(policyToWire(other))).status).toBe(400);
    const off = recoveryPolicy(w.root, lock, undefined);
    expect((await put(policyToWire(off))).status).toBe(200);
    expect(deposits(w)).toEqual([]);
    expect(grants(w)).toEqual([]);
    expect((await company(w)).recoveryPublicKey).toBeNull();
    expect((await policyOf(w))?.companyRecovery).toEqual({ enabled: false });
  });

  it("refuses recovery on without a key the server holds", async () => {
    const w = await weberWithAnna();
    const on = recoveryPolicy(
      w.root,
      signPolicy(w.root, {
        companyId: w.o.company.companyId,
        version: 0,
        lockAfterMinutes: 10,
        companyRecovery: { enabled: false },
      }),
      newCompanyRecoveryKey().fingerprint,
    );
    const answer = await w.o.setup.request("/api/company/policy", {
      method: "PUT",
      token: w.o.token,
      body: policyToWire(on),
    });
    expect(answer.status).toBe(400);
  });
});

describe("deposits", () => {
  it("keeps Anna's own deposit, signed by her for the key in force, and gives it back to her", async () => {
    const w = await weberWithAnna();
    const { key, policy } = await makeRecoveryKey(w);
    const { deposit, status } = await annaDeposits(w, policy, key.publicKey);
    expect(status).toBe(200);
    const held = await w.o.setup.request("/api/account/recovery-deposit", { token: w.annaToken });
    expect(HeldDepositWire.parse(await held.json()).deposit).toEqual(deposit);
    expect(
      (await w.o.setup.request("/api/account/recovery-deposit", { token: w.o.token })).status,
    ).toBe(404);
    // a second deposit replaces the first
    expect((await annaDeposits(w, policy, key.publicKey)).status).toBe(200);
    expect(deposits(w)).toHaveLength(1);
  });

  it("refuses a deposit signed by another key, for another key, or without a recovery key", async () => {
    const w = await weberWithAnna();
    const place = { companyId: w.o.company.companyId, accountId: w.anna.accountId };
    const put = (deposit: ReturnType<typeof depositAccountKey>) =>
      w.o.setup.request("/api/account/recovery-deposit", {
        method: "PUT",
        token: w.annaToken,
        body: depositToWire(deposit),
      });
    const early = newCompanyRecoveryKey();
    expect(
      (await put(depositAccountKey(early, w.anna.accountKey, place, w.anna.keyBlock.ed.secretKey)))
        .status,
    ).toBe(409);
    const { key } = await makeRecoveryKey(w);
    const stranger = depositAccountKey(key, w.anna.accountKey, place, ed25519KeyPair().secretKey);
    expect((await put(stranger)).status).toBe(400);
    const otherKey = depositAccountKey(
      early,
      w.anna.accountKey,
      place,
      w.anna.keyBlock.ed.secretKey,
    );
    expect((await put(otherKey)).status).toBe(400);
    const answer = await w.o.setup.request("/api/account/recovery-deposit", {
      method: "PUT",
      token: w.annaToken,
      body: {},
    });
    expect(answer.status).toBe(400);
    expect(deposits(w)).toEqual([]);
  });

  it("gives an owner a member's deposit with the sealed key block and state, nobody else", async () => {
    const w = await weberWithAnna();
    const { key, policy } = await makeRecoveryKey(w);
    const path = `/api/members/${w.annaIdText}/recovery`;
    expect((await w.o.setup.request(path, { token: w.o.token })).status).toBe(404);
    const { deposit } = await annaDeposits(w, policy, key.publicKey);
    const bundle = RecoveryBundleWire.parse(
      await (await w.o.setup.request(path, { token: w.o.token })).json(),
    );
    expect(bundle).toEqual({
      deposit,
      keyBlock: w.anna.upload.keyBlock,
      state: w.anna.upload.state,
      stateCounter: 0,
    });
    expect((await w.o.setup.request(path, { token: w.annaToken })).status).toBe(403);
    const jonas = `/api/members/${encodeBytes(w.o.owner.accountId)}/recovery`;
    expect((await w.o.setup.request(jonas, { token: w.o.token })).status).toBe(404);
  });
});

describe("owners come and go", () => {
  it("a new owner needs the recovery key wrapped to it, and a demoted one loses it", async () => {
    const w = await weberWithAnna();
    const { key } = await makeRecoveryKey(w);
    const role = (body: unknown) =>
      w.o.setup.request(`/api/members/${w.annaIdText}/role`, {
        method: "PUT",
        token: w.o.token,
        body,
      });
    const owner = changeRole(w.root, w.annaCert, "owner");
    const body = {
      certificate: toWire(owner.certificate),
      rootGrant: encodeBytes(owner.rootGrant ?? new Uint8Array()),
    };
    expect((await role(body)).status).toBe(400);
    const recoveryGrant = encodeBytes(grantRecoveryKey(key.secretKey, owner.certificate));
    expect((await role({ ...body, recoveryGrant })).status).toBe(200);
    expect(grants(w)).toHaveLength(2);
    const admin = changeRole(w.root, owner.certificate, "admin");
    const demote = {
      certificate: toWire(admin.certificate),
      rootGrant: encodeBytes(admin.rootGrant ?? new Uint8Array()),
    };
    expect((await role({ ...demote, recoveryGrant })).status).toBe(400);
    expect((await role(demote)).status).toBe(200);
    expect(grants(w).map((g) => g.accountId)).toEqual([encodeBytes(w.o.owner.accountId)]);
  });

  it("someone who leaves takes neither grant nor deposit along", async () => {
    const w = await weberWithAnna();
    const { key, policy } = await makeRecoveryKey(w);
    await annaDeposits(w, policy, key.publicKey);
    w.o.setup.db
      .insert(recoveryGrants)
      .values({ accountId: w.annaIdText, wrapped: Buffer.alloc(8), createdAt: 1 })
      .run();
    await w.o.setup.request(`/api/members/${w.annaIdText}`, { method: "DELETE", token: w.o.token });
    const db = w.o.setup.db;
    expect(
      db.select().from(recoveryDeposits).where(eq(recoveryDeposits.accountId, w.annaIdText)).all(),
    ).toEqual([]);
    expect(
      db.select().from(recoveryGrants).where(eq(recoveryGrants.accountId, w.annaIdText)).all(),
    ).toEqual([]);
  });
});
