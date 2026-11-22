import {
  certify,
  createAccount,
  depositFor,
  emptyState,
  encodeBytes,
  grantRecoveryKey,
  type MemberView,
  newCompanyRecoveryKey,
  type RecoveryBundle,
  recoveryPolicy,
  type Stored,
  sealRecoveryPackage,
  standardPolicy,
} from "@kennwort/core";
import {
  depositAccountKey,
  deviceFingerprint,
  digest,
  ed25519KeyPair,
  passphraseKeysWith,
  randomBytes,
  rootFingerprint,
  xwingKeyPair,
} from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import type { NewDevicePairing } from "../pairing/pairing.ts";
import { type ApproveDeps, approveMember, confirmRecovery } from "./approve.ts";
import { finishRecovery, pollRecovery } from "./recover-device.ts";

// K-307 part c: Jonas recovers Anna's access for her new device; the lying server is refused
const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const pinned = rootFingerprint(root.publicKey);
const weber = new Uint8Array(16).fill(0xc0);
const account = (passphrase: string) =>
  createAccount(passphrase, emptyState(pinned), { derive: quick });
const jonas = account("Jonas Kessel Rohr");
const anna = account("Anna Heizung Bad");
const cert = (a: ReturnType<typeof account>, role: "owner" | "member") =>
  certify(root.secretKey, {
    accountId: a.accountId,
    xwingPublicKey: a.keyBlock.xwing.publicKey,
    edPublicKey: a.keyBlock.ed.publicKey,
    companyId: weber,
    role,
    issuedAt: 1,
  });
const jonasCert = cert(jonas, "owner");
const annaCert = cert(anna, "member");
const key = newCompanyRecoveryKey();
const policy = recoveryPolicy(root.secretKey, standardPolicy(weber), key.fingerprint);
const deposited = depositFor(policy, key.publicKey, undefined, anna);
if (deposited.kind !== "deposit") throw new Error("Anna deposits");
const storedOf = (a: ReturnType<typeof account>): Stored => ({
  accountId: a.accountId,
  accountSalt: a.upload.accountSalt,
  keyBlock: a.upload.keyBlock,
  state: a.upload.state,
  stateCounter: 0,
  unlock: a.upload.unlock,
});
const bundle: RecoveryBundle = {
  deposit: deposited.deposit,
  keyBlock: anna.upload.keyBlock,
  state: anna.upload.state,
  stateCounter: 0,
};
const annaView: MemberView = {
  accountId: anna.accountId,
  name: "Anna",
  role: "member",
  status: "certified",
  certificate: annaCert,
};
const jonasOpened = {
  accountKey: jonas.accountKey,
  keyBlock: jonas.keyBlock,
  state: { ...jonas.state, policy: 0 },
  accountId: jonas.accountId,
  token: "token-jonas",
};

/** Anna's new device: a one-time key and the pairing secret of its QR code */
const device = () => {
  const keys = xwingKeyPair();
  const secret = randomBytes(32);
  const link = { id: "p1", fingerprint: deviceFingerprint(keys.publicKey), secret };
  const pairing: NewDevicePairing = { keys, id: "p1", pollToken: "poll", link };
  return { keys, link, pairing };
};

/** The server as Jonas's client sees it; each lie replaces one answer */
const server = (d: ReturnType<typeof device>, lies: Partial<ApproveDeps> = {}) => {
  const answered: Uint8Array[] = [];
  const log: string[] = [];
  const api: ApproveDeps = {
    pairingKey: async () => d.keys.publicKey,
    confirmPairing: async () => {
      log.push("confirm");
      return true;
    },
    company: async () => ({
      id: encodeBytes(weber),
      rootPublicKey: root.publicKey,
      policy,
      recoveryPublicKey: key.publicKey,
    }),
    recoveryGrant: async () => grantRecoveryKey(key.secretKey, jonasCert),
    memberRecovery: async () => bundle,
    answerRecovery: async (_token, _id, pkg) => {
      answered.push(pkg);
      return true;
    },
    auditAction: async (_token, action) => {
      log.push(action);
      return true;
    },
    ...lies,
  };
  return { api, answered, log };
};

describe("the owner approves (approveMember)", () => {
  it("wraps Anna's AK to her new device, which opens it with its QR secret", async () => {
    const d = device();
    const s = server(d);
    const approved = await approveMember(s.api, jonasOpened, annaView, d.link);
    expect(approved).toMatchObject({ ok: true, code: expect.stringMatching(/^\d{6}$/) });
    const polled = await pollRecovery(
      { pollPairing: async () => ({ state: "package", package: s.answered[0] as Uint8Array }) },
      d.pairing,
    );
    expect(polled.state === "package" && polled.content.accountKey).toEqual(anna.accountKey);
    expect(await confirmRecovery(s.api, jonasOpened, annaView, d.link)).toBe(true);
    expect(s.log).toEqual(["recovery", "confirm"]);
  });

  it("refuses a device key the server swapped in", async () => {
    const d = device();
    const s = server(d, { pairingKey: async () => xwingKeyPair().publicKey });
    expect(await approveMember(s.api, jonasOpened, annaView, d.link)).toEqual({
      ok: false,
      error: "other-key",
    });
  });

  it("refuses a recovery key the server wrapped to Jonas itself", async () => {
    const d = device();
    const servers = newCompanyRecoveryKey();
    const s = server(d, {
      recoveryGrant: async () => grantRecoveryKey(servers.secretKey, jonasCert),
    });
    expect(await approveMember(s.api, jonasOpened, annaView, d.link)).toEqual({
      ok: false,
      error: "no-key",
    });
  });

  it("refuses a deposit the server made, or one replayed for an earlier key", async () => {
    const d = device();
    const place = { companyId: weber, accountId: anna.accountId };
    const forged = depositAccountKey(key, randomBytes(32), place, ed25519KeyPair().secretKey);
    const earlier = newCompanyRecoveryKey();
    const old = depositAccountKey(earlier, anna.accountKey, place, anna.keyBlock.ed.secretKey);
    for (const deposit of [forged, old]) {
      const s = server(d, { memberRecovery: async () => ({ ...bundle, deposit }) });
      expect(await approveMember(s.api, jonasOpened, annaView, d.link)).toEqual({
        ok: false,
        error: "refused",
      });
      expect(s.answered).toEqual([]);
    }
  });

  it("refuses a member without a certificate, without a deposit, or a pairing gone", async () => {
    const d = device();
    const waiting: MemberView = { ...annaView, status: "waiting" };
    expect(await approveMember(server(d).api, jonasOpened, waiting, d.link)).toEqual({
      ok: false,
      error: "refused",
    });
    const none = server(d, { memberRecovery: async () => undefined });
    expect(await approveMember(none.api, jonasOpened, annaView, d.link)).toEqual({
      ok: false,
      error: "no-deposit",
    });
    const gone = server(d, { pairingKey: async () => undefined });
    expect(await approveMember(gone.api, jonasOpened, annaView, d.link)).toEqual({
      ok: false,
      error: "gone",
    });
  });

  it("does not confirm when the audit log refuses the signed event", async () => {
    const d = device();
    const s = server(d, { auditAction: async () => false });
    expect(await confirmRecovery(s.api, jonasOpened, annaView, d.link)).toBe(false);
    expect(s.log).toEqual([]);
  });
});

const packageFor = (d: ReturnType<typeof device>) =>
  sealRecoveryPackage(d.keys.publicKey, d.link.secret, {
    accountKey: anna.accountKey,
    accountId: anna.accountId,
    stateHash: new Uint8Array(32),
  });

describe("Anna's new device (pollRecovery, finishRecovery)", () => {
  it("refuses an AK the server wrapped to its one-time key without the QR secret", async () => {
    const d = device();
    const forged = sealRecoveryPackage(d.keys.publicKey, randomBytes(32), {
      accountKey: randomBytes(32),
      accountId: anna.accountId,
      stateHash: new Uint8Array(32),
    });
    for (const state of ["package", "confirmed"] as const) {
      const answer = { state, package: forged, token: "t" };
      expect(await pollRecovery({ pollPairing: async () => answer }, d.pairing)).toEqual({
        state: "failed",
      });
    }
    expect(await pollRecovery({ pollPairing: async () => undefined }, d.pairing)).toEqual({
      state: "failed",
    });
    expect(
      await pollRecovery({ pollPairing: async () => ({ state: "waiting" }) }, d.pairing),
    ).toEqual({ state: "waiting" });
    const real = { state: "confirmed" as const, package: packageFor(d), token: "t" };
    expect(await pollRecovery({ pollPairing: async () => real }, d.pairing)).toMatchObject({
      state: "confirmed",
      token: "t",
    });
  });

  const members = (certificate: typeof annaCert | null) => [
    {
      id: anna.accountId,
      role: "member" as const,
      name: "Anna",
      xwingPublicKey: anna.upload.xwingPublicKey,
      edPublicKey: anna.upload.edPublicKey,
      certificate,
      invitation: null,
    },
  ];
  const deps = (lies: Record<string, unknown> = {}) => {
    const replaced: unknown[] = [];
    return {
      replaced,
      deps: {
        derive: quick,
        random: () => new Uint8Array(16).fill(5),
        api: {
          keys: async () => storedOf(anna),
          replaceUnlock: async (_t: string, upload: unknown) => {
            replaced.push(upload);
            return true;
          },
          company: async () => ({
            id: encodeBytes(weber),
            rootPublicKey: root.publicKey,
            policy,
            recoveryPublicKey: key.publicKey,
          }),
          members: async () => members(annaCert),
          ...lies,
        },
      },
    };
  };

  it("opens Anna's account, checks it is certified and sets new unlock ways", async () => {
    const real = {
      accountKey: anna.accountKey,
      accountId: anna.accountId,
      stateHash: digest(anna.upload.state),
    };
    const d = deps();
    const done = await finishRecovery(d.deps, real, "t", "Neue Passphrase nach Recovery");
    expect(done.ok && done.value.keys.secretKey).toEqual(new Uint8Array(16).fill(5));
    expect(done.ok && done.value.opened.accountKey).toEqual(anna.accountKey);
    expect(d.replaced).toHaveLength(1);
  });

  it("refuses another state, an uncertified account or another root, and sets nothing", async () => {
    const real = () => ({
      accountKey: anna.accountKey.slice(),
      accountId: anna.accountId,
      stateHash: digest(anna.upload.state),
    });
    const otherState = { ...real(), stateHash: new Uint8Array(32) };
    const a = deps();
    expect(await finishRecovery(a.deps, otherState, "t", "x")).toEqual({
      ok: false,
      error: "other-account",
    });
    const uncertified = deps({ members: async () => members(null) });
    expect(await finishRecovery(uncertified.deps, real(), "t", "x")).toEqual({
      ok: false,
      error: "uncertified",
    });
    const otherRoot = deps({
      company: async () => ({
        id: "w",
        rootPublicKey: ed25519KeyPair().publicKey,
        policy: null,
        recoveryPublicKey: null,
      }),
    });
    expect(await finishRecovery(otherRoot.deps, real(), "t", "x")).toEqual({
      ok: false,
      error: "uncertified",
    });
    const away = deps({ keys: async () => undefined });
    expect(await finishRecovery(away.deps, real(), "t", "x")).toEqual({
      ok: false,
      error: "unreachable",
    });
    const refused = deps({ replaceUnlock: async () => false });
    expect(await finishRecovery(refused.deps, real(), "t", "x")).toEqual({
      ok: false,
      error: "failed",
    });
    for (const d of [a, uncertified, otherRoot, away]) expect(d.replaced).toEqual([]);
  });
});
