// K-307 part f (P-07, F-14): a new company root and how the server keeps it
import { describe, expect, it } from "bun:test";
import {
  certify,
  encodeBytes,
  isCertified,
  openRootGrant,
  proveKeyBlock,
  RootGrantWire,
  signPolicy,
} from "@kennwort/core";
import { ed25519KeyPair, rootFingerprint, sealKeyBlock, signRootChange } from "@kennwort/crypto";
import { eq } from "drizzle-orm";
import { accountKeys } from "../db/schema.ts";
import { makeRecoveryKey, weberWithAnna } from "../testing/recovery-setup.ts";
import { companyOf, membersOf, rotationOf, seconds, sendRotation } from "../testing/root-setup.ts";

describe("a new company root (P-07)", () => {
  it("is kept with its change, the new certificates, the policy and the grants", async () => {
    const w = await weberWithAnna();
    const rotation = await rotationOf(w);
    expect(await sendRotation(w, rotation)).toBe(200);
    const company = await companyOf(w);
    expect(company.rootPublicKey).toEqual(rotation.change.newRootPublicKey);
    expect(company.rootChanges).toEqual([rotation.change]);
    expect(company.policy).toEqual(rotation.policy);
    const members = await membersOf(w);
    for (const member of members) {
      const certificate = member.certificate as NonNullable<typeof member.certificate>;
      expect(isCertified(rotation.change.newRootPublicKey, certificate)).toBe(true);
      // The old root's certificate stays in the history, so the logs it signed still verify
      expect(member.previous?.map((c) => isCertified(w.o.company.rootPublicKey, c))).toEqual([
        true,
      ]);
    }
    const grant = await w.o.setup.request("/api/account/root-grant", { token: w.o.token });
    const keyBlock = {
      ...w.o.owner.keyBlock,
      rootFingerprint: rootFingerprint(company.rootPublicKey as Uint8Array),
    };
    const opened = openRootGrant(
      keyBlock,
      w.o.owner.accountId,
      w.o.company.companyId,
      RootGrantWire.parse(await grant.json()).rootGrant,
    );
    expect(opened).toEqual({ ok: true, value: rotation.rootSecretKey });
  });

  it("takes no second change from the old root, and none from anyone but an owner", async () => {
    const w = await weberWithAnna();
    const rotation = await rotationOf(w);
    expect(await sendRotation(w, rotation, w.annaToken)).toBe(403);
    expect(await sendRotation(w, rotation)).toBe(200);
    const again = {
      ...rotation,
      change: signRootChange(w.root, ed25519KeyPair().secretKey, w.o.company.companyId, seconds()),
    };
    expect(await sendRotation(w, again)).toBe(409);
    expect(await sendRotation(w, rotation)).toBe(409);
  });

  it("refuses a change of another company, another time or with a broken signature", async () => {
    const w = await weberWithAnna();
    const rotation = await rotationOf(w);
    const resign = (companyId: Uint8Array, time: number) => ({
      ...rotation,
      change: signRootChange(w.root, rotation.rootSecretKey, companyId, time),
    });
    expect(await sendRotation(w, resign(new Uint8Array(16).fill(9), seconds()))).toBe(400);
    expect(await sendRotation(w, resign(w.o.company.companyId, seconds() - 3600))).toBe(400);
    expect(await sendRotation(w, resign(w.o.company.companyId, seconds() + 3600))).toBe(400);
    const broken = { ...rotation, change: { ...rotation.change, time: rotation.change.time + 1 } };
    expect(await sendRotation(w, broken)).toBe(400);
    expect(await sendRotation(w, rotation)).toBe(200);
  });

  it("wants a certificate of the new root for exactly every member still in", async () => {
    const w = await weberWithAnna();
    const rotation = await rotationOf(w);
    const [jonas, anna] = rotation.certificates as [
      (typeof rotation.certificates)[number],
      (typeof rotation.certificates)[number],
    ];
    const wrong = [
      [jonas],
      [jonas, anna, anna],
      [jonas, certify(w.root, { ...anna })],
      [jonas, certify(rotation.rootSecretKey, { ...anna, role: "admin" })],
      [jonas, certify(rotation.rootSecretKey, { ...anna, issuedAt: w.annaCert.issuedAt })],
      [jonas, certify(rotation.rootSecretKey, { ...anna, xwingPublicKey: jonas.xwingPublicKey })],
      [jonas, certify(rotation.rootSecretKey, { ...anna, companyId: new Uint8Array(16) })],
    ];
    for (const certificates of wrong)
      expect(await sendRotation(w, { ...rotation, certificates })).toBe(400);
    expect(await sendRotation(w, rotation)).toBe(200);
  });

  it("leaves out whoever left: their certificate stays the old root's", async () => {
    const w = await weberWithAnna();
    await w.o.setup.request(`/api/members/${w.annaIdText}`, { method: "DELETE", token: w.o.token });
    const rotation = await rotationOf(w);
    expect(rotation.certificates).toHaveLength(1);
    expect(await sendRotation(w, rotation)).toBe(200);
    const anna = (await membersOf(w)).find((m) => encodeBytes(m.id) === w.annaIdText);
    expect(anna?.certificate).toEqual(w.annaCert);
    expect(anna?.previous).toEqual([]);
  });

  it("wants the new root wrapped to exactly the owners and admins still in", async () => {
    const w = await weberWithAnna();
    const rotation = await rotationOf(w);
    const [jonas] = rotation.grants;
    expect(await sendRotation(w, { ...rotation, grants: [] })).toBe(400);
    const toAnna = { accountId: w.anna.accountId, grant: (jonas as { grant: Uint8Array }).grant };
    expect(await sendRotation(w, { ...rotation, grants: [...rotation.grants, toAnna] })).toBe(400);
    expect(await sendRotation(w, rotation)).toBe(200);
  });

  it("wants the next policy signed by the new root, keeping the recovery key it holds", async () => {
    const w = await weberWithAnna();
    const { key } = await makeRecoveryKey(w);
    const rotation = await rotationOf(w);
    const { signature: _, ...policy } = rotation.policy;
    const wrong = [
      signPolicy(w.root, policy),
      signPolicy(rotation.rootSecretKey, { ...policy, version: policy.version - 1 }),
      signPolicy(rotation.rootSecretKey, { ...policy, companyRecovery: { enabled: false } }),
      signPolicy(rotation.rootSecretKey, {
        ...policy,
        companyRecovery: { enabled: true, fingerprint: new Uint8Array(32) },
      }),
      signPolicy(rotation.rootSecretKey, { ...policy, companyId: new Uint8Array(16) }),
    ];
    for (const signed of wrong)
      expect(await sendRotation(w, { ...rotation, policy: signed })).toBe(400);
    expect(await sendRotation(w, rotation)).toBe(200);
    expect((await companyOf(w)).recoveryPublicKey).toEqual(key.publicKey);
  });

  it("refuses a recovery key in the policy while the company holds none", async () => {
    const w = await weberWithAnna();
    const rotation = await rotationOf(w);
    const { signature: _, ...policy } = rotation.policy;
    const named = signPolicy(rotation.rootSecretKey, {
      ...policy,
      companyRecovery: { enabled: true, fingerprint: new Uint8Array(32) },
    });
    expect(await sendRotation(w, { ...rotation, policy: named })).toBe(400);
  });
});

describe("the key block written anew (P-07)", () => {
  it("replaces the account's own key block, only in the size of one", async () => {
    const w = await weberWithAnna();
    const block = { ...w.anna.keyBlock, rootFingerprint: new Uint8Array(32).fill(5) };
    const sealed = sealKeyBlock(w.anna.accountKey, w.anna.accountId, block);
    const put = (keyBlock: Uint8Array) =>
      w.o.setup.request("/api/account/key-block", {
        method: "PUT",
        token: w.annaToken,
        body: {
          keyBlock: encodeBytes(keyBlock),
          proof: encodeBytes(proveKeyBlock(w.anna.keyBlock.ed.secretKey, w.annaIdText, keyBlock)),
        },
      });
    expect((await put(sealed.subarray(1))).status).toBe(400);
    expect((await put(sealed)).status).toBe(200);
    const row = w.o.setup.db
      .select()
      .from(accountKeys)
      .where(eq(accountKeys.accountId, w.annaIdText))
      .get();
    expect(row && encodeBytes(new Uint8Array(row.keyBlock))).toBe(encodeBytes(sealed));
  });
});

describe("the key block and a session alone (found in review)", () => {
  // The key block holds the account's private keys under AK: every unlock way opens it. A session
  // alone must not replace it, or whoever holds one destroys the keys for good, as a session alone
  // cannot replace the unlock ways either (renew.ts)
  it("keeps the key block when the upload carries no signature of the account's own key", async () => {
    const w = await weberWithAnna();
    const stored = () =>
      w.o.setup.db.select().from(accountKeys).where(eq(accountKeys.accountId, w.annaIdText)).get()
        ?.keyBlock;
    const before = stored();
    const garbage = new Uint8Array(
      sealKeyBlock(w.anna.accountKey, w.anna.accountId, w.anna.keyBlock).length,
    ).fill(7);
    const answer = await w.o.setup.request("/api/account/key-block", {
      method: "PUT",
      token: w.annaToken,
      // signed, but by a key that is not the account's
      body: {
        keyBlock: encodeBytes(garbage),
        proof: encodeBytes(proveKeyBlock(ed25519KeyPair().secretKey, w.annaIdText, garbage)),
      },
    });
    expect(answer.status).toBe(403);
    expect(stored()).toEqual(before);
  });
});
