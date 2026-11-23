// K-607 (P-28): a person deletes their own account, confirmed with the passphrase (the sign-in
// key's answer under the purpose delete-account). Weber Haustechnik: Jonas owns the company, Anna
// was invited.
import { describe, expect, it } from "bun:test";
import {
  addMember,
  answerChallenge,
  answerDeletionChallenge,
  bytes,
  changeAccess,
  createVault,
  encodeBytes,
  loginKeyPair,
  MembersWire,
  removeMember,
  toWire,
} from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import { eq } from "drizzle-orm";
import {
  accountKeys,
  accounts,
  auditEvents,
  authSession,
  companies,
  deviceSessions,
  invitations,
  loginFailures,
  loginKeys,
  notifications,
  oidcIdentities,
  pushSubscriptions,
  vaultLog,
  vaults,
} from "../db/schema.ts";
import { ownerWithKeys, quick } from "../testing/owner-with-keys.ts";
import {
  createBuero,
  logOf,
  NOW,
  post,
  stateOf,
  type Weber,
  weber,
} from "../testing/weber-vaults.ts";

const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";
const annaLogin = ed25519KeyPair(new Uint8Array(32).fill(0x2a));
const annaId = (w: Weber) => encodeBytes(w.annaId);
const jonasId = (w: Weber) => encodeBytes(w.o.owner.accountId);

/** Anna with a sign-in key the test holds (weber() gave her a placeholder) */
const withAnnaLogin = async () => {
  const w = await weber();
  w.o.setup.db
    .update(loginKeys)
    .set({ publicKey: encodeBytes(annaLogin.publicKey) })
    .where(eq(loginKeys.accountId, annaId(w)))
    .run();
  return w;
};

type Setup = Weber["o"]["setup"];
const challengeFor = async (setup: Setup, token: string) => {
  const answer = await setup.request("/api/account/deletion/challenge", { method: "POST", token });
  expect(answer.status).toBe(200);
  return (await answer.json()) as { challengeId: string; challenge: string; accountSalt: string };
};

/** Confirms the deletion with this sign-in secret key, as the device does */
const deleteWith = async (setup: Setup, token: string, accountId: string, secret: Uint8Array) => {
  const { challengeId, challenge } = await challengeFor(setup, token);
  const signature = answerDeletionChallenge(secret, accountId, bytes(32).parse(challenge));
  return setup.request("/api/account", {
    method: "DELETE",
    token,
    body: { challengeId, signature: encodeBytes(signature) },
  });
};
const annaDeletes = (w: Weber, secret = annaLogin.secretKey) =>
  deleteWith(w.o.setup, w.annaToken, annaId(w), secret);

/** Jonas's sign-in key from his passphrase, as his device derives it */
const jonasLogin = (w: Weber) =>
  loginKeyPair(
    PASSPHRASE,
    w.o.owner.upload.accountSalt,
    w.o.owner.secretKey,
    w.o.owner.accountId,
    quick,
  ).secretKey;

/** Büro with Anna in it under this role */
const bueroWithAnna = async (w: Weber, role: "read" | "edit" | "manage") => {
  const { vault, vaultId } = await createBuero(w);
  const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
  if (!s0.ok) throw new Error(s0.error);
  const added = addMember(
    w.jonas.signer,
    s0.value,
    vault.ring,
    w.annaCert,
    { role, validUntil: 0 },
    NOW + 1,
  );
  expect(
    (
      await post(w, vaultId, {
        entry: toWire(added.entry),
        wrappedKey: encodeBytes(added.wrappedKey),
      })
    ).status,
  ).toBe(201);
  return { vault, vaultId, entries: [vault.genesis, added.entry] };
};

/** Anna's own vault, with Jonas in it as a reader when asked */
const annasVault = async (w: Weber, withJonas: boolean) => {
  const signer = { accountId: w.annaId, edSecretKey: w.annaEd.secretKey };
  const vault = createVault(signer, w.annaCert, NOW);
  const vaultId = encodeBytes(vault.ring.vaultId);
  await w.o.setup.request("/api/vaults", { token: w.annaToken, body: { id: vaultId } });
  const genesis = { entry: toWire(vault.genesis), wrappedKey: encodeBytes(vault.wrappedKey) };
  expect((await post(w, vaultId, genesis, w.annaToken)).status).toBe(201);
  if (withJonas) {
    const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
    if (!s0.ok) throw new Error(s0.error);
    const added = addMember(
      signer,
      s0.value,
      vault.ring,
      w.jonas.certificate,
      { role: "read", validUntil: 0 },
      NOW + 1,
    );
    const body = { entry: toWire(added.entry), wrappedKey: encodeBytes(added.wrappedKey) };
    expect((await post(w, vaultId, body, w.annaToken)).status).toBe(201);
  }
  return vaultId;
};

describe("deleting one's own account (K-607, P-28)", () => {
  it("needs the passphrase: a wrong answer deletes nothing and counts as a failed sign-in", async () => {
    const w = await withAnnaLogin();
    const wrong = ed25519KeyPair(new Uint8Array(32).fill(0x2b)).secretKey;
    const answer = await annaDeletes(w, wrong);
    expect(answer.status).toBe(401);
    expect(await answer.json()).toEqual({ error: "denied" });
    const db = w.o.setup.db;
    expect(
      db
        .select()
        .from(loginFailures)
        .where(eq(loginFailures.accountId, annaId(w)))
        .all(),
    ).toHaveLength(1);
    expect((await w.o.setup.request("/api/vaults", { token: w.annaToken })).status).toBe(200);
  });

  it("takes a challenge once, only from the same account and only for a deletion", async () => {
    const w = await withAnnaLogin();
    const setup = w.o.setup;
    // Jonas's challenge in Anna's session
    const jonas = await challengeFor(setup, w.o.token);
    const signature = answerDeletionChallenge(
      annaLogin.secretKey,
      annaId(w),
      bytes(32).parse(jonas.challenge),
    );
    const foreign = await setup.request("/api/account", {
      method: "DELETE",
      token: w.annaToken,
      body: { challengeId: jonas.challengeId, signature: encodeBytes(signature) },
    });
    expect(foreign.status).toBe(401);
    // A sign-in challenge of Anna's
    const login = await setup.request("/auth/login-key/challenge", {
      body: { accountId: annaId(w) },
    });
    const signIn = (await login.json()) as { challengeId: string; challenge: string };
    const asLogin = await setup.request("/api/account", {
      method: "DELETE",
      token: w.annaToken,
      body: {
        challengeId: signIn.challengeId,
        signature: encodeBytes(
          answerDeletionChallenge(
            annaLogin.secretKey,
            annaId(w),
            bytes(32).parse(signIn.challenge),
          ),
        ),
      },
    });
    expect(asLogin.status).toBe(401);
    // A sign-in answer to a deletion challenge is no confirmation
    const mine = await challengeFor(setup, w.annaToken);
    const wrongPurpose = await setup.request("/api/account", {
      method: "DELETE",
      token: w.annaToken,
      body: {
        challengeId: mine.challengeId,
        signature: encodeBytes(
          answerChallenge(annaLogin.secretKey, annaId(w), bytes(32).parse(mine.challenge)),
        ),
      },
    });
    expect(wrongPurpose.status).toBe(401);
    expect((await setup.request("/api/vaults", { token: w.annaToken })).status).toBe(200);
  });

  it("never signs in with a deletion challenge", async () => {
    const w = await withAnnaLogin();
    const { challengeId, challenge } = await challengeFor(w.o.setup, w.annaToken);
    const verified = await w.o.setup.request("/auth/login-key/verify", {
      body: {
        challengeId,
        signature: encodeBytes(
          answerChallenge(annaLogin.secretKey, annaId(w), bytes(32).parse(challenge)),
        ),
      },
    });
    expect(verified.status).toBe(401);
  });

  it("removes her sessions, devices, push addresses, notifications and sign-in, keeps her public keys", async () => {
    const w = await withAnnaLogin();
    const db = w.o.setup.db;
    const company = encodeBytes(w.o.company.companyId);
    const session = db
      .select()
      .from(authSession)
      .where(eq(authSession.userId, annaId(w)))
      .get();
    if (!session) throw new Error("Anna has a session");
    db.insert(deviceSessions)
      .values({
        sessionId: session.id,
        accountId: annaId(w),
        deviceId: "laptop",
        name: "Firefox",
        createdAt: 1,
        lastSeenAt: 1,
      })
      .run();
    db.insert(pushSubscriptions)
      .values({
        endpoint: "https://push.example/anna",
        accountId: annaId(w),
        sessionId: session.id,
        createdAt: 1,
      })
      .run();
    db.insert(notifications)
      .values({
        id: "n1",
        companyId: company,
        accountId: annaId(w),
        kind: "vault-added",
        createdAt: 1,
      })
      .run();
    db.insert(oidcIdentities)
      .values({
        accountId: annaId(w),
        issuer: "https://idp.example",
        subject: "anna",
        name: "Anna Weber",
        linkedAt: 1,
      })
      .run();
    const answer = await annaDeletes(w);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ deleted: true, company: false });
    expect((await w.o.setup.request("/api/vaults", { token: w.annaToken })).status).toBe(401);
    for (const table of [
      deviceSessions,
      pushSubscriptions,
      notifications,
      oidcIdentities,
      loginKeys,
    ])
      expect(
        db
          .select()
          .from(table)
          .where(eq(table.accountId, annaId(w)))
          .all(),
      ).toEqual([]);
    expect(
      db
        .select()
        .from(authSession)
        .where(eq(authSession.userId, annaId(w)))
        .all(),
    ).toEqual([]);
    // The invitation that names her goes too
    expect(
      db
        .select()
        .from(invitations)
        .where(eq(invitations.accountId, annaId(w)))
        .all(),
    ).toEqual([]);
    const keys = db
      .select()
      .from(accountKeys)
      .where(eq(accountKeys.accountId, annaId(w)))
      .get();
    expect(keys?.certificate).not.toBeNull();
    expect(keys?.edPublicKey.length).toBe(32);
    expect(keys?.keyBlock.length).toBe(0);
    expect(keys?.state.length).toBe(0);
    // Jonas still sees her as gone, with the certificate the logs she signed need
    const listed = MembersWire.parse(
      await (await w.o.setup.request("/api/members", { token: w.o.token })).json(),
    );
    const her = listed.members.find((m) => encodeBytes(m.id) === annaId(w));
    expect(her?.leftAt).toBeGreaterThan(0);
    expect(her?.certificate).not.toBeNull();
    expect(db.select().from(auditEvents).all().at(-1)).toMatchObject({
      action: "member-left",
      actor: annaId(w),
      subject: annaId(w),
    });
  });

  it("drops a vault only she is in and leaves a shared one to its manager", async () => {
    const w = await withAnnaLogin();
    const own = await annasVault(w, false);
    const { vaultId: buero } = await bueroWithAnna(w, "edit");
    const plan = await (
      await w.o.setup.request("/api/account/deletion", { token: w.annaToken })
    ).json();
    expect(plan).toEqual({
      company: "leave",
      vaults: { drop: [own], leave: [], await: [buero], "sole-manager": [] },
      refused: null,
    });
    expect((await annaDeletes(w)).status).toBe(200);
    const db = w.o.setup.db;
    expect(db.select().from(vaults).where(eq(vaults.id, own)).all()).toEqual([]);
    expect(db.select().from(vaultLog).where(eq(vaultLog.vaultId, own)).all()).toEqual([]);
    // Büro still names her: Jonas's client removes her and rotates the key (P-11)
    const log = await logOf(w, buero);
    expect(Array.isArray(log) && log.length).toBe(2);
  });

  it("refuses while she is the only manager of a vault others are in", async () => {
    const w = await withAnnaLogin();
    const shared = await annasVault(w, true);
    const answer = await annaDeletes(w);
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({ error: "sole-manager", vaults: [shared] });
    expect((await w.o.setup.request("/api/vaults", { token: w.annaToken })).status).toBe(200);
  });

  it("takes her own signed removal where another manager remains", async () => {
    const w = await withAnnaLogin();
    const { vault, vaultId, entries } = await bueroWithAnna(w, "manage");
    const state = stateOf(w, vault.ring.vaultId, entries);
    if (!state.ok) throw new Error(state.error);
    const signer = { accountId: w.annaId, edSecretKey: w.annaEd.secretKey };
    const remove = removeMember(signer, state.value, vault.ring.vaultId, w.annaId, NOW + 2);
    expect((await post(w, vaultId, { entry: toWire(remove) }, w.annaToken)).status).toBe(201);
    expect((await annaDeletes(w)).status).toBe(200);
    const after = await logOf(w, vaultId);
    expect(Array.isArray(after) && after.at(-1)?.action).toBe("remove");
  });

  it("keeps the last owner while others remain, until another owner is named", async () => {
    const w = await withAnnaLogin();
    const answer = await deleteWith(w.o.setup, w.o.token, jonasId(w), jonasLogin(w));
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({ error: "last-owner", vaults: [] });
    expect((await w.o.setup.request("/api/vaults", { token: w.o.token })).status).toBe(200);
    w.o.setup.db
      .update(accounts)
      .set({ role: "owner" })
      .where(eq(accounts.id, annaId(w)))
      .run();
    expect((await deleteWith(w.o.setup, w.o.token, jonasId(w), jonasLogin(w))).status).toBe(200);
  });

  it("erases the whole company with its last account, and nothing of another company", async () => {
    const jonas = await ownerWithKeys("setup-code-of-weber-haustechnik", PASSPHRASE, true, false);
    const setup = jonas.setup;
    const company = encodeBytes(jonas.company.companyId);
    const own = createVault(
      { accountId: jonas.owner.accountId, edSecretKey: jonas.owner.keyBlock.ed.secretKey },
      jonas.company.certificate,
      NOW,
    );
    const ownId = encodeBytes(own.ring.vaultId);
    await setup.request("/api/vaults", { token: jonas.token, body: { id: ownId } });
    await setup.request(`/api/vaults/${ownId}/log`, {
      token: jonas.token,
      body: { entry: toWire(own.genesis), wrappedKey: encodeBytes(own.wrappedKey) },
    });
    // Another company on the same server
    const other = { id: "mueller-elektro", createdAt: 1 };
    setup.db.insert(companies).values(other).run();
    setup.db
      .insert(accounts)
      .values({ id: "max", companyId: other.id, role: "owner", createdAt: 1 })
      .run();
    const secret = loginKeyPair(
      PASSPHRASE,
      jonas.owner.upload.accountSalt,
      jonas.owner.secretKey,
      jonas.owner.accountId,
      quick,
    ).secretKey;
    const answer = await deleteWith(setup, jonas.token, encodeBytes(jonas.owner.accountId), secret);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ deleted: true, company: true });
    const db = setup.db;
    expect(db.select().from(companies).where(eq(companies.id, company)).all()).toEqual([]);
    expect(db.select().from(accounts).where(eq(accounts.companyId, company)).all()).toEqual([]);
    expect(db.select().from(vaults).all()).toEqual([]);
    expect(db.select().from(auditEvents).where(eq(auditEvents.companyId, company)).all()).toEqual(
      [],
    );
    expect(db.select().from(companies).where(eq(companies.id, other.id)).all()).toHaveLength(1);
    expect(db.select().from(accounts).where(eq(accounts.id, "max")).all()).toHaveLength(1);
  });

  it("lets a second manager stay manager when she promotes him before", async () => {
    const w = await withAnnaLogin();
    const shared = await annasVault(w, true);
    const entries = await logOf(w, shared);
    if (!Array.isArray(entries)) throw new Error("log");
    const state = stateOf(w, bytes(16).parse(shared), entries);
    if (!state.ok) throw new Error(state.error);
    const signer = { accountId: w.annaId, edSecretKey: w.annaEd.secretKey };
    const promote = changeAccess(
      signer,
      state.value,
      bytes(16).parse(shared),
      w.o.owner.accountId,
      { role: "manage", validUntil: 0 },
      NOW + 3,
    );
    expect((await post(w, shared, { entry: toWire(promote) }, w.annaToken)).status).toBe(201);
    const plan = await (
      await w.o.setup.request("/api/account/deletion", { token: w.annaToken })
    ).json();
    expect(plan).toMatchObject({ vaults: { leave: [shared] }, refused: null });
  });
});
