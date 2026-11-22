// K-307 part e (P-12): Anna's recovery kit got into other hands; her device renews every key of
// the account, the server replaces them only with her previous key's signature (F-11), and the new
// bundle counts once Jonas certifies it
import { describe, expect, it } from "bun:test";
import {
  addMember,
  bytes,
  type Certificate,
  certify,
  encodeBytes,
  idKey,
  MembersWire,
  rekeyAccount,
  rekeyMember,
  rekeyToWire,
  signInWithPassphrase,
  signInWithRecoveryKey,
  toWire,
  verifyLog,
} from "@kennwort/core";
import { eq } from "drizzle-orm";
import {
  accountKeys,
  authSession,
  entryShares,
  recoveryDeposits,
  vaultKeys,
} from "../db/schema.ts";
import { weberWithBuero } from "../testing/emergency-setup.ts";
import { quick } from "../testing/owner-with-keys.ts";
import { annaDeposits, makeRecoveryKey } from "../testing/recovery-setup.ts";

const ANNA = "Anna Heizung Bad Fliese";

/** Büro with Anna added as editor by Jonas; her client renews her keys */
const renewal = async () => {
  const s = await weberWithBuero();
  const { w } = s;
  const trust = () => ({
    rootPublicKey: w.o.company.rootPublicKey,
    certificates: new Map([
      [idKey(w.o.owner.accountId), w.o.company.certificate],
      [idKey(w.anna.accountId), w.annaCert],
    ]),
    now: s.seconds(),
  });
  const genesis = verifyLog(s.buero.ring.vaultId, [s.buero.genesis], trust());
  if (!genesis.ok) throw new Error(genesis.error);
  const signer = { accountId: s.jonas.id, edSecretKey: s.jonas.edSecretKey };
  const added = addMember(
    signer,
    genesis.value,
    s.buero.ring,
    w.annaCert,
    { role: "edit", validUntil: 0 },
    s.seconds() - 30,
  );
  await s.request(`/api/vaults/${s.vaultId}/log`, {
    body: { entry: toWire(added.entry), wrappedKey: encodeBytes(added.wrappedKey) },
  });
  const rekeyed = (counter = 0, rings = [s.buero.ring], edSecretKey = w.anna.keyBlock.ed) =>
    rekeyAccount(
      { ...w.anna, keyBlock: { ...w.anna.keyBlock, ed: edSecretKey }, stateCounter: counter },
      ANNA,
      rings,
      { derive: quick },
    );
  const send = (made: ReturnType<typeof rekeyed>, token = w.annaToken) =>
    s.request("/api/account/rekey", { method: "PUT", token, body: rekeyToWire(made.upload) });
  const keysOf = () =>
    w.o.setup.db.select().from(accountKeys).where(eq(accountKeys.accountId, w.annaIdText)).get();
  const members = async () =>
    MembersWire.parse(await (await s.request("/api/members")).json()).members.find(
      (m) => encodeBytes(m.id) === w.annaIdText,
    );
  return { s, w, trust, added, rekeyed, send, keysOf, members };
};

describe("PUT /api/account/rekey", () => {
  it("replaces bundle, key block, state, unlock ways and vault keys; the old certificate goes to the history", async () => {
    const { w, rekeyed, send, keysOf, members, s } = await renewal();
    const made = rekeyed();
    const answer = await send(made);
    expect([answer.status, await answer.json()]).toEqual([200, { stored: true }]);
    const keys = keysOf();
    expect(encodeBytes(new Uint8Array(keys?.edPublicKey ?? []))).toBe(
      encodeBytes(made.keyBlock.ed.publicKey),
    );
    expect(encodeBytes(new Uint8Array(keys?.keyBlock ?? []))).toBe(
      encodeBytes(made.upload.keyBlock),
    );
    expect(keys?.stateCounter).toBe(1);
    expect(keys?.certificate).toBeNull();
    const listed = await members();
    expect(listed?.certificate).toBeNull();
    expect(listed?.previous).toEqual([w.annaCert]);
    expect(listed?.edPublicKey).toEqual(made.keyBlock.ed.publicKey);
    const held = w.o.setup.db
      .select()
      .from(vaultKeys)
      .where(eq(vaultKeys.accountId, w.annaIdText))
      .all();
    expect(held.map((k) => [k.vaultId, k.epoch, encodeBytes(new Uint8Array(k.wrapped))])).toEqual([
      [s.vaultId, 0, encodeBytes(made.upload.vaultKeys[0]?.wrapped as Uint8Array)],
    ]);
  });

  it("lets the old passphrase keys and the old Recovery Key sign in no more; the new ones do", async () => {
    const { w, rekeyed, send } = await renewal();
    const made = rekeyed();
    await send(made);
    const post = w.o.post;
    expect(
      (await signInWithPassphrase(post, w.anna.accountId, ANNA, w.anna.secretKey, quick)).ok,
    ).toBe(false);
    expect((await signInWithRecoveryKey(post, w.anna.accountId, w.anna.recoveryKey)).ok).toBe(
      false,
    );
    expect(
      (await signInWithPassphrase(post, w.anna.accountId, ANNA, made.secretKey, quick)).ok,
    ).toBe(true);
    expect((await signInWithRecoveryKey(post, w.anna.accountId, made.recoveryKey)).ok).toBe(true);
  });

  it("signs out every other device and keeps the one that renewed", async () => {
    const { w, rekeyed, send } = await renewal();
    const other = await signInWithPassphrase(
      w.o.post,
      w.anna.accountId,
      ANNA,
      w.anna.secretKey,
      quick,
    );
    if (!other.ok) throw new Error(other.error);
    await send(rekeyed());
    expect((await w.o.setup.request("/api/account/keys", { token: other.token })).status).toBe(401);
    expect((await w.o.setup.request("/api/account/keys", { token: w.annaToken })).status).toBe(200);
    const sessions = w.o.setup.db
      .select()
      .from(authSession)
      .where(eq(authSession.userId, w.annaIdText))
      .all();
    expect(sessions).toHaveLength(1);
  });

  it("drops her recovery deposit and the shares to her: they open with the old keys", async () => {
    const { s, w, rekeyed, send } = await renewal();
    const { policy, key } = await makeRecoveryKey(w);
    await annaDeposits(w, policy, key.publicKey);
    w.o.setup.db
      .insert(entryShares)
      .values({
        vaultId: s.vaultId,
        entryId: "e",
        recipient: w.annaIdText,
        role: "read",
        validUntil: 0,
        commitment: Buffer.alloc(32),
        wrappedKey: Buffer.alloc(8),
        sharer: encodeBytes(w.o.owner.accountId),
        time: 1,
        signature: Buffer.alloc(65),
        storedAt: 1,
      })
      .run();
    await send(rekeyed());
    const db = w.o.setup.db;
    expect(
      db.select().from(recoveryDeposits).where(eq(recoveryDeposits.accountId, w.annaIdText)).all(),
    ).toEqual([]);
    expect(
      db.select().from(entryShares).where(eq(entryShares.recipient, w.annaIdText)).all(),
    ).toEqual([]);
  });

  it("takes nothing without the previous key's signature: a stolen session replaces nothing", async () => {
    const { rekeyed, send, keysOf, w } = await renewal();
    const before = keysOf();
    const byJonas = rekeyed(0, undefined, w.o.owner.keyBlock.ed);
    expect([(await send(byJonas)).status, keysOf()]).toEqual([403, before]);
    const made = rekeyed();
    const changed = {
      ...made,
      upload: { ...made.upload, keyBlock: new Uint8Array(made.upload.keyBlock.length) },
    };
    expect((await send(changed)).status).toBe(403);
    expect(keysOf()).toEqual(before);
  });

  it("takes it only on top of the state counter it holds", async () => {
    const { rekeyed, send } = await renewal();
    const answer = await send(rekeyed(3));
    expect([answer.status, await answer.json()]).toEqual([
      409,
      { error: "stale", stateCounter: 0 },
    ]);
  });

  it("takes vault keys only for keys she holds, each once", async () => {
    const { rekeyed, send, s } = await renewal();
    const foreign = { ...s.buero.ring, vaultId: new Uint8Array(16).fill(9) };
    expect((await send(rekeyed(0, [foreign]))).status).toBe(400);
    expect((await send(rekeyed(0, [s.buero.ring, s.buero.ring]))).status).toBe(400);
    expect((await send(rekeyed(0, [{ ...s.buero.ring, epoch: 1 }]))).status).toBe(400);
    expect((await send(rekeyed(0, []))).status).toBe(200);
  });

  it("refuses a malformed body", async () => {
    const { s, w } = await renewal();
    const answer = await s.request("/api/account/rekey", {
      method: "PUT",
      token: w.annaToken,
      body: {},
    });
    expect(answer.status).toBe(400);
  });
});

describe("the renewed bundle on the server", () => {
  const renewed = async () => {
    const r = await renewal();
    const made = r.rekeyed();
    await r.send(made);
    const certificate = (issuedAt: number): Certificate =>
      certify(r.w.root, {
        ...r.w.annaCert,
        xwingPublicKey: made.keyBlock.xwing.publicKey,
        edPublicKey: made.keyBlock.ed.publicKey,
        issuedAt,
      });
    const certifyAs = (c: Certificate) =>
      r.s.request(`/api/members/${r.w.annaIdText}/certificate`, { method: "PUT", body: toWire(c) });
    return { ...r, made, certificate, certifyAs };
  };

  it("gets its certificate only issued later than the one it replaces", async () => {
    const { w, certificate, certifyAs, members } = await renewed();
    expect((await certifyAs(certificate(w.annaCert.issuedAt))).status).toBe(400);
    const later = certificate(w.annaCert.issuedAt + 1);
    expect((await certifyAs(later)).status).toBe(200);
    expect((await members())?.certificate).toEqual(later);
  });

  it("takes her own rekey in the log, signed with the new keys, though she only edits", async () => {
    const { s, w, made, certificate, certifyAs, trust, added } = await renewed();
    const renewedCert = certificate(s.seconds());
    await certifyAs(renewedCert);
    const current = trust();
    current.certificates.set(idKey(w.anna.accountId), renewedCert);
    const history = new Map([[idKey(w.anna.accountId), [w.annaCert]]]);
    const state = verifyLog(s.buero.ring.vaultId, [s.buero.genesis, added.entry], {
      ...current,
      history,
    });
    if (!state.ok) throw new Error(state.error);
    const own = rekeyMember(
      { accountId: w.anna.accountId, edSecretKey: made.keyBlock.ed.secretKey },
      state.value,
      s.buero.ring.vaultId,
      renewedCert,
      s.seconds(),
    );
    if (!own.ok) throw new Error(own.error);
    const appended = await s.request(`/api/vaults/${s.vaultId}/log`, {
      token: w.annaToken,
      body: { entry: toWire(own.value) },
    });
    expect(appended.status).toBe(201);
    // ... and her old keys, which someone else has too, sign nothing in her name any more
    const byOld = {
      ...own.value,
      seq: 3,
      signature: bytes(65).parse(encodeBytes(new Uint8Array(65))),
    };
    expect(
      (
        await s.request(`/api/vaults/${s.vaultId}/log`, {
          token: w.annaToken,
          body: { entry: toWire(byOld) },
        })
      ).status,
    ).not.toBe(201);
  });
});
