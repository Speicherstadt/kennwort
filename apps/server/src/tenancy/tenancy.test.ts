import { bytes, encodeBytes, rekeyToWire } from "@kennwort/core";
import { ed25519KeyPair, signRekey } from "@kennwort/crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createAuth } from "../auth/better-auth.ts";
import { DEVICE_PACKAGE_LENGTH } from "../auth/pairings.ts";
import { migrate, openDatabase } from "../db/database.ts";
import {
  accountKeys,
  accounts,
  auditEvents,
  authPasskey,
  authSession,
  authUser,
  companies,
  emergencyGrants,
  emergencyRevocations,
  entryShares,
  invitations,
  loginChallenges,
  loginKeys,
  notificationPrefs,
  notifications,
  oneTimeLinks,
  pairings,
  pushSubscriptions,
  recoveryDeposits,
  recoveryGrants,
  rootGrants,
  unlockPasskeys,
  vaultKeys,
  vaults,
} from "../db/schema.ts";
import { createLog } from "../log.ts";
import { invitationBody } from "../testing/sign-in-setup.ts";
import type { Session } from "./session.ts";

// Two companies on one server: Weber Haustechnik (Jonas, Anna) and Müller Elektro (Max)
const setup = () => {
  const db = openDatabase(":memory:");
  migrate(db);
  db.insert(companies)
    .values([
      { id: "weber", createdAt: 1 },
      { id: "mueller", createdAt: 2 },
    ])
    .run();
  db.insert(accounts)
    .values([
      { id: "jonas", companyId: "weber", role: "owner", createdAt: 1 },
      { id: "anna", companyId: "weber", createdAt: 2 },
      { id: "max", companyId: "mueller", createdAt: 3 },
    ])
    .run();
  const sessions: Record<string, Session> = {
    "token-jonas": { accountId: "jonas", companyId: "weber" },
    "token-max": { accountId: "max", companyId: "mueller" },
  };
  const authenticate = async (request: Request) =>
    sessions[request.headers.get("x-test-session") ?? ""];
  const origin = "http://localhost:28100";
  const auth = createAuth(db, {
    secret: "test-secret-of-at-least-thirty-two-chars",
    baseURL: origin,
    rpID: "localhost",
    origin,
  });
  const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));
  const signIn = {
    auth,
    secret: "test-secret-of-at-least-thirty-two-chars",
    now: () => 1,
    random,
    allow: () => true,
    address: () => "192.0.2.1",
  };
  return Object.assign(createApp({ db, log: createLog("error", () => {}), authenticate, signIn }), {
    db,
  });
};

const app = setup();
const maxAnsweredPairing = () =>
  app.db
    .insert(pairings)
    .values({
      id: "max-pairing",
      publicKey: Buffer.alloc(1216),
      pollHash: "x",
      accountId: "max",
      package: Buffer.alloc(8),
      expiresAt: Date.now() + 60_000,
    })
    .onConflictDoNothing()
    .run();

/** Max (Müller Elektro) signed in on a device: a Better Auth user, a session and its device */
const maxSession = () => {
  const now = new Date();
  app.db
    .insert(authUser)
    .values({
      id: "max",
      name: "",
      email: "max@x.invalid",
      emailVerified: false,
      companyId: "mueller",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
  app.db
    .insert(authSession)
    .values({
      id: "max-session",
      token: "max-token",
      userId: "max",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
};

/** Max's keys on the server, uncertified */
/** Max's passkey at Müller Elektro (K-707) */
const maxPasskey = () => {
  maxSession();
  app.db
    .insert(authPasskey)
    .values({
      id: "max-pk",
      publicKey: "AA",
      userId: "max",
      credentialID: "bWF4",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
    })
    .onConflictDoNothing()
    .run();
};

const maxKeys = () =>
  app.db
    .insert(accountKeys)
    .values({
      accountId: "max",
      xwingPublicKey: Buffer.alloc(1216),
      edPublicKey: Buffer.alloc(32),
      keyBlock: Buffer.alloc(8),
      unlockPassphrase: Buffer.alloc(8),
      unlockRecovery: Buffer.alloc(8),
      state: Buffer.alloc(8),
      stateCounter: 0,
      updatedAt: 1,
    })
    .onConflictDoNothing()
    .run();

const maxDeposit = () =>
  app.db
    .insert(recoveryDeposits)
    .values({
      accountId: "max",
      pkg: Buffer.alloc(1194),
      commitment: Buffer.alloc(32),
      signature: Buffer.alloc(65),
      storedAt: 1,
    })
    .onConflictDoNothing()
    .run();

const asJonas = (path: string) =>
  app.request(path, { headers: { "x-test-session": "token-jonas" } });
const jonasSends = (method: string, path: string, body: unknown) =>
  app.request(path, {
    method,
    headers: { "x-test-session": "token-jonas", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const muellerVault = encodeBytes(new Uint8Array(16).fill(0xa1));
app.db.insert(vaults).values({ id: muellerVault, companyId: "mueller", createdAt: 3 }).run();
// a key row naming Jonas in Müller Elektro's vault must not let him in
app.db
  .insert(vaultKeys)
  .values({ vaultId: muellerVault, accountId: "jonas", epoch: 0, wrapped: Buffer.alloc(1) })
  .run();

// a share in Müller Elektro's vault naming Jonas as its recipient must not reach him
const muellerShare = { vaultId: muellerVault, entryId: "e", recipient: "jonas" };
app.db
  .insert(entryShares)
  .values({
    ...muellerShare,
    role: "read",
    validUntil: 0,
    commitment: Buffer.alloc(32),
    wrappedKey: Buffer.alloc(1194),
    sharer: "max",
    time: 1,
    signature: Buffer.alloc(65),
    storedAt: 1,
  })
  .run();
const muellerShares = `/api/vaults/${muellerVault}/entries/e/shares`;

// K-307 part d: a grant by Max (Müller Elektro) naming Jonas, released, and a revocation to him
app.db
  .insert(emergencyGrants)
  .values({
    grantor: "max",
    grantee: "jonas",
    grant: "{}",
    packages: '{"vaults":[]}',
    time: 1,
    request: "{}",
    requestedAt: 0,
    approval: "{}",
    releasedAt: 1,
    storedAt: 1,
  })
  .run();
app.db
  .insert(emergencyRevocations)
  .values({ grantor: "max", grantee: "jonas", statement: "{}", storedAt: 1 })
  .run();
// K-601: a one-time link of Max (Müller Elektro), which Jonas may neither list nor revoke
app.db
  .insert(oneTimeLinks)
  .values({
    id: "max-link",
    fetchHash: "0".repeat(64),
    companyId: "mueller",
    createdBy: "max",
    ciphertext: Buffer.alloc(60),
    createdAt: 1,
    expiresAt: Date.now() + 3_600_000,
    maxFetches: 1,
    remaining: 1,
  })
  .run();
const maxLinkStays = () =>
  expect(
    app.db
      .select()
      .from(oneTimeLinks)
      .all()
      .filter((row) => row.companyId === "mueller")
      .map((row) => row.id),
  ).toEqual(["max-link"]);
// Max's notification, push preference and device subscription (K-602)
app.db
  .insert(notifications)
  .values({
    id: "max-note",
    companyId: "mueller",
    accountId: "max",
    kind: "link-opened",
    subject: "max-link",
    createdAt: 1,
  })
  .run();
app.db.insert(notificationPrefs).values({ accountId: "max", prefs: '{"push":[]}' }).run();
const maxEndpoint = "https://fcm.googleapis.com/fcm/send/max-device";
app.db
  .insert(pushSubscriptions)
  .values({ endpoint: maxEndpoint, accountId: "max", sessionId: "max-session", createdAt: 1 })
  .run();
const maxNoteStays = () =>
  expect(app.db.select().from(notifications).where(eq(notifications.id, "max-note")).get()).toEqual(
    expect.objectContaining({ accountId: "max", readAt: null }),
  );
const maxPushStays = () => {
  expect(app.db.select().from(notificationPrefs).all()).toEqual([
    { accountId: "max", prefs: '{"push":[]}' },
  ]);
  expect(
    app.db
      .select()
      .from(pushSubscriptions)
      .all()
      .map((row) => row.endpoint),
  ).toEqual([maxEndpoint]);
};
const maxGrantStays = () =>
  expect(
    app.db
      .select()
      .from(emergencyGrants)
      .all()
      .map((row) => row.grantor),
  ).toEqual(["max"]);

/**
 * One case per route under /api: Jonas (Weber Haustechnik) asks for what belongs to Müller Elektro.
 * A route without a case here fails the test below, so every new endpoint brings its own.
 */
const cases: Record<string, () => Promise<void>> = {
  "GET /api/company": async () => {
    expect(await (await asJonas("/api/company")).json()).toEqual({
      id: "weber",
      createdAt: 1,
      rootPublicKey: null,
      policy: null,
      recoveryPublicKey: null,
      rootChanges: [],
    });
  },
  "GET /api/accounts": async () => {
    const list = (await (await asJonas("/api/accounts")).json()) as { id: string }[];
    expect(list.map((account) => account.id).sort()).toEqual(["anna", "jonas"]);
  },
  "POST /api/invitations": async () => {
    const response = await jonasSends("POST", "/api/invitations", invitationBody("Anna"));
    const { id } = (await response.json()) as { id: string };
    expect(
      app.db
        .select()
        .from(invitations)
        .all()
        .find((row) => row.id === id)?.companyId,
    ).toBe("weber");
  },
  "GET /api/accounts/:accountId": async () => {
    expect((await asJonas("/api/accounts/max")).status).toBe(404);
    expect((await asJonas("/api/accounts/anna")).status).toBe(200);
  },
  "GET /api/account/keys": async () => {
    // Max (Müller Elektro) has uploaded keys; Jonas gets only his own, which he has not
    app.db
      .insert(accountKeys)
      .values({
        accountId: "max",
        xwingPublicKey: Buffer.alloc(1216),
        edPublicKey: Buffer.alloc(32),
        keyBlock: Buffer.alloc(8),
        unlockPassphrase: Buffer.alloc(8),
        unlockRecovery: Buffer.alloc(8),
        state: Buffer.alloc(8),
        stateCounter: 0,
        updatedAt: 1,
      })
      .run();
    expect((await asJonas("/api/account/keys")).status).toBe(404);
  },
  // K-607: the plan, the export and the deletion read and touch only the session's own account
  "GET /api/account/deletion": async () => {
    const answer = await asJonas("/api/account/deletion");
    expect(answer.status).toBe(200);
    expect(JSON.stringify(await answer.json())).not.toContain(muellerVault);
  },
  "GET /api/account/export": async () => {
    const answer = await asJonas("/api/account/export");
    expect(answer.status).toBe(200);
    const text = JSON.stringify(await answer.json());
    expect(text).toContain('"companyId":"weber"');
    expect(text).not.toContain("mueller");
    expect(text).not.toContain('"max"');
  },
  "POST /api/account/deletion/challenge": async () => {
    // Jonas has no sign-in key here: no challenge, and none in Max's name
    expect((await jonasSends("POST", "/api/account/deletion/challenge", {})).status).toBe(409);
    expect(
      app.db.select().from(loginChallenges).where(eq(loginChallenges.accountId, "max")).all(),
    ).toEqual([]);
  },
  "DELETE /api/account": async () => {
    // Max's deletion challenge does nothing in Jonas's session, and Max stays
    app.db
      .insert(loginChallenges)
      .values({
        id: "max-delete",
        accountId: "max",
        way: "delete",
        challenge: "AAAA",
        expiresAt: Date.now() + 60_000,
      })
      .run();
    const answer = await jonasSends("DELETE", "/api/account", {
      challengeId: "max-delete",
      signature: encodeBytes(new Uint8Array(65)),
    });
    expect(answer.status).toBe(401);
    expect(app.db.select().from(accounts).where(eq(accounts.id, "max")).get()?.leftAt).toBeNull();
    expect(app.db.select().from(accounts).where(eq(accounts.id, "jonas")).get()?.leftAt).toBeNull();
  },
  "PUT /api/account/keys": async () => {
    const keys = {
      xwingPublicKey: encodeBytes(new Uint8Array(1216)),
      edPublicKey: encodeBytes(new Uint8Array(32)),
      keyBlock: "AAAA",
      unlock: { passphrase: "AAAA", recovery: "AAAA" },
      recoveryLoginPublicKey: encodeBytes(new Uint8Array(32)),
      state: "AAAA",
      stateCounter: 0,
    };
    expect((await jonasSends("PUT", "/api/account/keys", keys)).status).toBe(201);
    const rows = app.db.select().from(accountKeys).all();
    expect(rows.find((row) => row.accountId === "jonas")?.stateCounter).toBe(0);
  },
  "GET /api/pairings/:id": async () => {
    // A pairing Max (Müller Elektro) answered: Jonas sees nothing of it any more
    maxAnsweredPairing();
    expect((await asJonas("/api/pairings/max-pairing")).status).toBe(404);
  },
  "PUT /api/pairings/:id": async () => {
    maxAnsweredPairing();
    const pkg = encodeBytes(new Uint8Array(DEVICE_PACKAGE_LENGTH));
    expect((await jonasSends("PUT", "/api/pairings/max-pairing", { package: pkg })).status).toBe(
      404,
    );
    const row = app.db.select().from(pairings).where(eq(pairings.id, "max-pairing")).get();
    expect(row?.accountId).toBe("max");
  },
  "POST /api/pairings/:id/confirm": async () => {
    maxAnsweredPairing();
    expect((await jonasSends("POST", "/api/pairings/max-pairing/confirm", {})).status).toBe(404);
    const row = app.db.select().from(pairings).where(eq(pairings.id, "max-pairing")).get();
    expect(row?.confirmed).toBe(false);
  },
  "GET /api/members": async () => {
    // Max (Müller Elektro) is not among Weber Haustechnik's members
    const answer = (await (await asJonas("/api/members")).json()) as { members: { id: string }[] };
    expect(answer.members.map((member) => member.id).sort()).toEqual(["anna", "jonas"]);
  },
  "PUT /api/members/:id/certificate": async () => {
    // Jonas cannot certify Max, though Max has keys
    maxKeys();
    const response = await jonasSends("PUT", "/api/members/max/certificate", {});
    expect(response.status).toBe(404);
    const max = app.db.select().from(accountKeys).where(eq(accountKeys.accountId, "max")).get();
    expect(max?.certificate).toBeNull();
  },
  "PUT /api/members/:id/role": async () => {
    // Jonas (owner of Weber Haustechnik) cannot give Max (Müller Elektro) a role
    maxKeys();
    const response = await jonasSends("PUT", "/api/members/max/role", {});
    expect(response.status).toBe(404);
    expect(app.db.select().from(accounts).where(eq(accounts.id, "max")).get()?.role).toBe("member");
  },
  "DELETE /api/members/:id": async () => {
    // Jonas (owner of Weber Haustechnik) cannot make Max (Müller Elektro) leave
    const response = await jonasSends("DELETE", "/api/members/max", {});
    expect(response.status).toBe(404);
    expect(app.db.select().from(accounts).where(eq(accounts.id, "max")).get()?.leftAt).toBeNull();
  },
  "GET /api/account/root-grant": async () => {
    // Only Jonas's own grant: Max's stays unseen
    app.db
      .insert(rootGrants)
      .values({ accountId: "max", wrapped: Buffer.alloc(8), createdAt: 1 })
      .onConflictDoNothing()
      .run();
    expect((await asJonas("/api/account/root-grant")).status).toBe(404);
  },
  "PUT /api/company/policy": async () => {
    // Jonas writes no policy for Müller Elektro
    await jonasSends("PUT", "/api/company/policy", {});
    const mueller = app.db.select().from(companies).where(eq(companies.id, "mueller")).get();
    expect(mueller?.policy).toBeNull();
  },
  // K-307 part c: the company recovery key, its grants and the deposits stay within the company
  "PUT /api/company/recovery-key": async () => {
    await jonasSends("PUT", "/api/company/recovery-key", {});
    const mueller = app.db.select().from(companies).where(eq(companies.id, "mueller")).get();
    expect(mueller?.recoveryPublicKey).toBeNull();
  },
  // K-307 part f: a new root changes only the own company, and only the own key block
  "PUT /api/company/root": async () => {
    await jonasSends("PUT", "/api/company/root", {});
    const mueller = app.db.select().from(companies).where(eq(companies.id, "mueller")).get();
    expect(mueller?.rootPublicKey).toBeNull();
  },
  "PUT /api/account/key-block": async () => {
    app.db
      .insert(accountKeys)
      .values({
        accountId: "max",
        xwingPublicKey: Buffer.alloc(1216),
        edPublicKey: Buffer.alloc(32),
        keyBlock: Buffer.alloc(149, 7),
        unlockPassphrase: Buffer.alloc(73),
        unlockRecovery: Buffer.alloc(73),
        state: Buffer.alloc(8),
        stateCounter: 0,
        updatedAt: 1,
      })
      .onConflictDoNothing()
      .run();
    const maxKeys = () =>
      app.db.select().from(accountKeys).where(eq(accountKeys.accountId, "max")).get()?.keyBlock;
    const before = maxKeys();
    const block = Buffer.alloc(149, 9).toString("base64url");
    await jonasSends("PUT", "/api/account/key-block", { keyBlock: block });
    expect(maxKeys()).toEqual(before);
  },
  "GET /api/account/recovery-grant": async () => {
    app.db
      .insert(recoveryGrants)
      .values({ accountId: "max", wrapped: Buffer.alloc(8), createdAt: 1 })
      .onConflictDoNothing()
      .run();
    expect((await asJonas("/api/account/recovery-grant")).status).toBe(404);
  },
  "GET /api/account/recovery-deposit": async () => {
    maxDeposit();
    expect((await asJonas("/api/account/recovery-deposit")).status).toBe(404);
  },
  "PUT /api/account/recovery-deposit": async () => {
    // Jonas's company has no recovery key; Max's deposit stays as it is
    maxDeposit();
    const body = {
      pkg: encodeBytes(new Uint8Array(1194)),
      commitment: encodeBytes(new Uint8Array(32)),
      signature: encodeBytes(new Uint8Array(65)),
    };
    expect((await jonasSends("PUT", "/api/account/recovery-deposit", body)).status).toBe(409);
    const max = app.db
      .select()
      .from(recoveryDeposits)
      .where(eq(recoveryDeposits.accountId, "max"))
      .get();
    expect(max?.storedAt).toBe(1);
  },
  "GET /api/members/:id/recovery": async () => {
    // Jonas (owner) cannot load Max's deposit, though Max has keys and one
    maxKeys();
    maxDeposit();
    expect((await asJonas("/api/members/max/recovery")).status).toBe(404);
  },
  "GET /api/devices": async () => {
    // Max's session is not among Jonas's devices
    maxSession();
    const answer = (await (await asJonas("/api/devices")).json()) as { devices: { id: string }[] };
    expect(answer.devices.map((device) => device.id)).not.toContain("max-session");
  },
  "DELETE /api/devices/:id": async () => {
    maxSession();
    expect((await jonasSends("DELETE", "/api/devices/max-session", undefined)).status).toBe(404);
    expect(
      app.db.select().from(authSession).where(eq(authSession.id, "max-session")).get(),
    ).toBeDefined();
  },
  "PUT /api/account/unlock": async () => {
    // Replaces only Jonas's own sign-in keys; Max's (Müller Elektro) stay as they are
    app.db
      .insert(loginKeys)
      .values({ accountId: "max", publicKey: "max-key", accountSalt: "max-salt", createdAt: 1 })
      .onConflictDoNothing()
      .run();
    await jonasSends("PUT", "/api/account/unlock", {
      accountSalt: encodeBytes(new Uint8Array(16)),
      loginPublicKey: encodeBytes(new Uint8Array(32)),
      recoveryLoginPublicKey: encodeBytes(new Uint8Array(32)),
      unlock: { passphrase: "AAAA", recovery: "AAAA" },
    });
    const max = app.db.select().from(loginKeys).where(eq(loginKeys.accountId, "max")).get();
    expect(max?.publicKey).toBe("max-key");
  },
  "PUT /api/account/rekey": async () => {
    // Jonas renews his keys (P-12): Max's keys, session and vault keys at Müller Elektro stay
    maxKeys();
    maxSession();
    const ed = ed25519KeyPair(new Uint8Array(32).fill(0x10));
    app.db
      .insert(accountKeys)
      .values({
        accountId: "jonas",
        xwingPublicKey: Buffer.alloc(1216),
        edPublicKey: Buffer.from(ed.publicKey),
        keyBlock: Buffer.alloc(8),
        unlockPassphrase: Buffer.alloc(8),
        unlockRecovery: Buffer.alloc(8),
        state: Buffer.alloc(8),
        stateCounter: 0,
        updatedAt: 1,
      })
      .onConflictDoNothing()
      .run();
    const statement = {
      accountSalt: new Uint8Array(16),
      loginPublicKey: new Uint8Array(32),
      recoveryLoginPublicKey: new Uint8Array(32),
      xwingPublicKey: new Uint8Array(1216).fill(1),
      edPublicKey: new Uint8Array(32).fill(1),
      keyBlock: new Uint8Array(8).fill(1),
      state: new Uint8Array(8).fill(1),
      stateCounter: 1,
      unlock: { passphrase: new Uint8Array(73), recovery: new Uint8Array(73) },
      vaultKeys: [],
    };
    const accountId = bytes(16).parse(encodeBytes(new Uint8Array(16)));
    const proof = signRekey(ed.secretKey, { ...statement, accountId });
    await jonasSends("PUT", "/api/account/rekey", rekeyToWire({ ...statement, accountId, proof }));
    const max = app.db.select().from(accountKeys).where(eq(accountKeys.accountId, "max")).get();
    expect(max?.keyBlock).toEqual(Buffer.alloc(8));
    expect(
      app.db.select().from(authSession).where(eq(authSession.id, "max-session")).get(),
    ).toBeDefined();
  },
  "PUT /api/account/unlock-passkeys": async () => {
    // Jonas cannot hang a sealed AK on Max's passkey (K-707)
    maxPasskey();
    const answer = await jonasSends("PUT", "/api/account/unlock-passkeys", {
      credentialId: "bWF4",
      sealed: encodeBytes(new Uint8Array(73)),
    });
    expect(answer.status).toBe(404);
    expect(app.db.select().from(unlockPasskeys).all()).toEqual([]);
  },
  "DELETE /api/account/unlock-passkeys/:credentialId": async () => {
    maxPasskey();
    expect(
      (await jonasSends("DELETE", "/api/account/unlock-passkeys/bWF4", undefined)).status,
    ).toBe(404);
    expect(
      app.db.select().from(authPasskey).where(eq(authPasskey.id, "max-pk")).get(),
    ).toBeDefined();
  },
  "PUT /api/account/state": async () => {
    // Writes only Jonas's own state; Max's stays at counter 0
    await jonasSends("PUT", "/api/account/state", { state: "AAAA", stateCounter: 1 });
    expect(
      app.db
        .select()
        .from(accountKeys)
        .all()
        .find((row) => row.accountId === "max")?.stateCounter,
    ).toBe(0);
  },
  "GET /api/audit": async () => {
    // Jonas (owner) gets only Weber Haustechnik's chain, though Müller Elektro has one too
    app.db
      .insert(auditEvents)
      .values({
        companyId: "mueller",
        seq: 0,
        time: 1,
        actor: "max",
        action: "signed-in",
        subject: "session",
        signature: Buffer.alloc(0),
        prevHash: Buffer.alloc(32),
        hash: Buffer.alloc(32),
      })
      .run();
    const exported = (await (await asJonas("/api/audit")).json()) as {
      companyId: string;
      events: { companyId: string }[];
    };
    expect(exported.companyId).toBe("weber");
    expect(exported.events.every((event) => event.companyId === "weber")).toBe(true);
  },
  "POST /api/audit": async () => {
    const signature = encodeBytes(new Uint8Array(65).fill(1));
    // An export names format, scope and its ID (K-504)
    const subject = `kdbx/all/${encodeBytes(new Uint8Array(16).fill(7))}`;
    const body = { action: "export", subject, signature };
    expect((await jonasSends("POST", "/api/audit", body)).status).toBe(201);
    const rows = app.db.select().from(auditEvents).all();
    expect(rows.find((row) => row.subject === subject)?.companyId).toBe("weber");
  },
  "POST /api/vaults": async () => {
    // Müller Elektro's vault ID cannot be taken over; a new vault lands in Jonas's company
    expect((await jonasSends("POST", "/api/vaults", { id: muellerVault })).status).toBe(409);
    const own = encodeBytes(new Uint8Array(16).fill(0xa2));
    expect((await jonasSends("POST", "/api/vaults", { id: own })).status).toBe(201);
    expect(app.db.select().from(vaults).where(eq(vaults.id, own)).get()?.companyId).toBe("weber");
  },
  "GET /api/vaults/:vaultId/records": async () => {
    expect((await asJonas(`/api/vaults/${muellerVault}/records`)).status).toBe(404);
  },
  "GET /api/vaults/:vaultId/entries/:entryId/versions": async () => {
    expect((await asJonas(`/api/vaults/${muellerVault}/entries/x/versions`)).status).toBe(404);
  },
  "PUT /api/vaults/:vaultId/records": async () => {
    expect((await jonasSends("PUT", `/api/vaults/${muellerVault}/records`, {})).status).toBe(404);
  },
  "GET /api/vaults/:vaultId/events": async () => {
    expect((await asJonas(`/api/vaults/${muellerVault}/events`)).status).toBe(404);
  },
  "GET /api/vaults": async () => {
    const answer = (await (await asJonas("/api/vaults")).json()) as { vaults: { id: string }[] };
    expect(answer.vaults.map((vault) => vault.id)).not.toContain(muellerVault);
  },
  "GET /api/vaults/:vaultId/log": async () => {
    expect((await asJonas(`/api/vaults/${muellerVault}/log`)).status).toBe(404);
  },
  "GET /api/vaults/:vaultId/keys": async () => {
    expect((await asJonas(`/api/vaults/${muellerVault}/keys`)).status).toBe(404);
  },
  "PUT /api/vaults/:vaultId/name": async () => {
    const body = { epoch: 0, name: encodeBytes(new Uint8Array(42)) };
    expect((await jonasSends("PUT", `/api/vaults/${muellerVault}/name`, body)).status).toBe(404);
  },
  "POST /api/vaults/:vaultId/requests": async () => {
    expect((await jonasSends("POST", `/api/vaults/${muellerVault}/requests`, {})).status).toBe(404);
  },
  "GET /api/vaults/:vaultId/requests": async () => {
    expect((await asJonas(`/api/vaults/${muellerVault}/requests`)).status).toBe(404);
  },
  "DELETE /api/vaults/:vaultId/requests/:accountId": async () => {
    const path = `/api/vaults/${muellerVault}/requests/jonas`;
    expect((await jonasSends("DELETE", path, undefined)).status).toBe(404);
  },
  "PUT /api/vaults/:vaultId/entries/:entryId/shares": async () => {
    expect((await jonasSends("PUT", muellerShares, {})).status).toBe(404);
  },
  "GET /api/vaults/:vaultId/entries/:entryId/shares": async () => {
    expect((await asJonas(muellerShares)).status).toBe(404);
  },
  "DELETE /api/vaults/:vaultId/entries/:entryId/shares/:recipient": async () => {
    expect((await jonasSends("DELETE", `${muellerShares}/jonas`, undefined)).status).toBe(404);
    expect(app.db.select().from(entryShares).all()).toHaveLength(1);
  },
  "GET /api/shared": async () => {
    expect(await (await asJonas("/api/shared")).json()).toEqual({ shares: [] });
  },
  "GET /api/shared/:vaultId/:entryId": async () => {
    expect((await asJonas(`/api/shared/${muellerVault}/e`)).status).toBe(404);
  },
  // K-307 part d: emergency access between accounts of another company does not exist here
  "GET /api/emergency": async () => {
    expect(await (await asJonas("/api/emergency")).json()).toEqual({
      given: [],
      received: [],
      revocations: [],
    });
  },
  "PUT /api/emergency/:grantee": async () => {
    expect((await jonasSends("PUT", "/api/emergency/max", {})).status).toBe(400);
    maxGrantStays();
  },
  "DELETE /api/emergency/:grantee": async () => {
    expect((await jonasSends("DELETE", "/api/emergency/max", {})).status).toBe(404);
    maxGrantStays();
  },
  "POST /api/emergency/:grantee/objection": async () => {
    expect((await jonasSends("POST", "/api/emergency/max/objection", {})).status).toBe(404);
  },
  "POST /api/emergency/:grantee/approval": async () => {
    expect((await jonasSends("POST", "/api/emergency/max/approval", {})).status).toBe(404);
  },
  "POST /api/emergency/:grantor/request": async () => {
    expect((await jonasSends("POST", "/api/emergency/max/request", {})).status).toBe(404);
  },
  "GET /api/emergency/:grantor/release": async () => {
    expect((await asJonas("/api/emergency/max/release")).status).toBe(404);
  },
  "GET /api/emergency/:grantor/vaults": async () => {
    expect((await asJonas("/api/emergency/max/vaults")).status).toBe(404);
  },
  "GET /api/links": async () => {
    expect(await (await asJonas("/api/links")).json()).toEqual({ links: [] });
  },
  "POST /api/links": async () => {
    const body = {
      ciphertext: encodeBytes(new Uint8Array(60)),
      expiresInMs: 3_600_000,
      maxFetches: 1,
    };
    expect((await jonasSends("POST", "/api/links", body)).status).toBe(201);
    const mine = app.db
      .select()
      .from(oneTimeLinks)
      .all()
      .filter((row) => row.createdBy === "jonas");
    expect(mine.map((row) => row.companyId)).toEqual(["weber"]);
    maxLinkStays();
  },
  "DELETE /api/links/:id": async () => {
    expect((await jonasSends("DELETE", "/api/links/max-link", undefined)).status).toBe(404);
    maxLinkStays();
  },
  // The leak check's proxy holds no company data at all; this server has it turned off
  "GET /api/pwned/:prefix": async () => {
    const answer = await asJonas("/api/pwned/5BAA6");
    expect(answer.status).toBe(404);
    expect(await answer.json()).toEqual({ error: "leak-check-off" });
  },
  "POST /api/vaults/:vaultId/log": async () => {
    expect((await jonasSends("POST", `/api/vaults/${muellerVault}/log`, {})).status).toBe(404);
  },
  "GET /api/notifications": async () => {
    const list = await (await asJonas("/api/notifications")).json();
    expect(JSON.stringify(list)).not.toContain("max-note");
    maxNoteStays();
  },
  "POST /api/notifications/read": async () => {
    expect((await jonasSends("POST", "/api/notifications/read", undefined)).status).toBe(200);
    maxNoteStays();
  },
  "POST /api/notifications/:id/read": async () => {
    expect((await jonasSends("POST", "/api/notifications/max-note/read", undefined)).status).toBe(
      404,
    );
    maxNoteStays();
  },
  "DELETE /api/notifications/:id": async () => {
    expect((await jonasSends("DELETE", "/api/notifications/max-note", undefined)).status).toBe(404);
    maxNoteStays();
  },
  "GET /api/notifications/preferences": async () => {
    const prefs = await (await asJonas("/api/notifications/preferences")).json();
    expect(prefs.push.length).toBeGreaterThan(0);
  },
  "PUT /api/notifications/preferences": async () => {
    expect(
      (await jonasSends("PUT", "/api/notifications/preferences", { push: ["root-changed"] }))
        .status,
    ).toBe(200);
    expect(
      app.db.select().from(notificationPrefs).where(eq(notificationPrefs.accountId, "max")).get(),
    ).toEqual({ accountId: "max", prefs: '{"push":[]}' });
    app.db.delete(notificationPrefs).where(eq(notificationPrefs.accountId, "jonas")).run();
  },
  "GET /api/notifications/events": async () => {
    const response = await asJonas("/api/notifications/events");
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    expect(new TextDecoder().decode((await reader?.read())?.value)).toContain("event: ready");
    // Jonas listens on his own account only
    expect(app.notificationHub.listening("jonas")).toBe(1);
    expect(app.notificationHub.listening("max")).toBe(0);
    await reader?.cancel();
  },
  "GET /api/push/key": async () => {
    // Without push set up there is no key; with it, the key is the installation's, the same for all
    expect((await asJonas("/api/push/key")).status).toBe(404);
  },
  "PUT /api/push/subscription": async () => {
    expect(
      (await jonasSends("PUT", "/api/push/subscription", { endpoint: maxEndpoint })).status,
    ).toBe(404);
    maxPushStays();
  },
  "DELETE /api/push/subscription": async () => {
    expect(
      (await jonasSends("DELETE", "/api/push/subscription", { endpoint: maxEndpoint })).status,
    ).toBe(200);
    maxPushStays();
  },
};

// Every route at /api or below, of any method; only the session middleware itself is no endpoint
type Route = { method: string; path: string; handler: unknown };
const isApi = (path: string) => path === "/api" || path.startsWith("/api/");
export const apiRoutes = (routes: Route[], middleware: unknown) =>
  [
    ...new Set(
      routes
        .filter((route) => isApi(route.path) && route.handler !== middleware)
        .map((route) => `${route.method} ${route.path}`),
    ),
  ].sort();

describe("apiRoutes", () => {
  it("lists any-method and catch-all routes and the /api root, and leaves out only the session middleware", () => {
    const middleware = () => {};
    const endpoint = () => {};
    const routes = [
      { method: "ALL", path: "/api/*", handler: middleware },
      { method: "ALL", path: "/api/*", handler: endpoint },
      { method: "ALL", path: "/api/everything", handler: endpoint },
      { method: "GET", path: "/api", handler: endpoint },
      { method: "GET", path: "/apis", handler: endpoint },
      { method: "GET", path: "/health", handler: endpoint },
    ];
    expect(apiRoutes(routes, middleware)).toEqual([
      "ALL /api/*",
      "ALL /api/everything",
      "GET /api",
    ]);
  });
});

describe("tenants (K-202)", () => {
  it("has a case for every route under /api", () => {
    expect(apiRoutes(app.routes, app.requireSession)).toEqual(Object.keys(cases).sort());
  });

  it.each(Object.keys(cases))("%s gives no data of another company", async (route) => {
    await cases[route]?.();
  });

  it.each(Object.keys(cases))("%s needs a session", async (route) => {
    const [method = "GET", pattern = ""] = route.split(" ");
    const path = pattern.replace(/:\w+/g, "anna").replace("*", "x");
    const request = method === "ALL" ? "POST" : method;
    expect((await app.request(path, { method: request })).status).toBe(401);
    const forged = { method: request, headers: { "x-test-session": "forged" } };
    expect((await app.request(path, forged)).status).toBe(401);
  });

  it("gives Müller Elektro its own data", async () => {
    const response = await app.request("/api/accounts", {
      headers: { "x-test-session": "token-max" },
    });
    expect(await response.json()).toEqual([{ id: "max", createdAt: 3 }]);
  });
});
