/**
 * The attacks on renewing an account's keys after its recovery kit got into other hands (P-12,
 * K-307 part e): a server that keeps serving the old bundle, withholds the new certificate, plays
 * the old kit back after the change, or skips a vault's rotation. Whoever has the kit holds Anna's
 * old keys; each test names the attack, and the client must notice it.
 */
import {
  type KeyBlock,
  passphraseKeysWith,
  rootFingerprint,
  unwrapVaultKey,
} from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { createAccount } from "../account/create.ts";
import { rekeyAccount } from "../account/rekey.ts";
import { emptyState, openState } from "../account/state.ts";
import { type Stored, unlockWithPassphrase, unlockWithRecoveryKey } from "../account/unlock.ts";
import { certificateFingerprint } from "../membership/certificate.ts";
import type { LogEntry } from "../membership/log-entry.ts";
import { checkMembers } from "../membership/members.ts";
import { dueRekeys, rekeyMember } from "../membership/renewal.ts";
import { dueExits, rotateVaultKey } from "../membership/rotation.ts";
import {
  annaNew,
  RENEWED_AT,
  renewedCertificate,
  renewedTrust,
  withheldTrust,
} from "../membership/test/renewed.ts";
import { openVaultKey } from "../membership/vault-ops.ts";
import {
  certificateFor,
  idKey,
  remember,
  type Trust,
  verifyLog,
} from "../membership/verify-log.ts";
import { encodeBytes } from "../sync/bytes.ts";
import { edit, emptyDevice, pull, rotateEntries, sync } from "../sync/device.ts";
import { memoryServer } from "../sync/memory-server.ts";
import { sealRecord } from "../sync/record.ts";
import {
  anna,
  bank,
  certificate,
  contextFor,
  id,
  jonas,
  logEntries,
  type Person,
  root,
  vaultId,
  vaultKey,
  withField,
} from "../sync/test/fixtures.ts";
import { lyingServer } from "./lying-server.ts";

const ring0 = { vaultId, epoch: 0, vaultKey };
const newKey = new Uint8Array(32).fill(0x77);
const at = RENEWED_AT + 100;
const blockOf = (p: Person): KeyBlock => ({
  xwing: p.xwing,
  ed: p.ed,
  rootFingerprint: rootFingerprint(root.publicKey),
});
const verified = (entries: LogEntry[], trust: Trust) => {
  const state = verifyLog(vaultId, entries, trust);
  if (!state.ok) throw new Error(state.error);
  return state.value;
};

/**
 * Jonas saved the bank login in Büro; Anna renewed her keys, signed her own rekey with the new
 * ones, and Jonas rotated the vault key and wrote the entry again
 */
const renewed = async () => {
  const trust = renewedTrust();
  const server = memoryServer();
  const device = (await sync(edit(emptyDevice(), id(0xe1), bank), server, contextFor(jonas)))
    .device;
  const before = verified(logEntries, trust);
  const own = rekeyMember(
    { accountId: anna.id, edSecretKey: annaNew.ed.secretKey },
    before,
    vaultId,
    renewedCertificate,
    at,
  );
  if (!own.ok) throw new Error(own.error);
  const rekeyed = verified([...logEntries, own.value], trust);
  const rotation = rotateVaultKey(
    { accountId: jonas.id, edSecretKey: jonas.ed.secretKey },
    rekeyed,
    vaultId,
    trust,
    at + 1,
    newKey,
  );
  if (!rotation.ok) throw new Error(rotation.error);
  const entries = [...logEntries, own.value, rotation.value.entry];
  const state = verified(entries, trust);
  const ctx = (p: Person) => ({
    ...contextFor(p),
    trust,
    ring: rotation.value.ring,
    older: [ring0],
    log: state,
    lastSeen: state.hash,
    now: at + 2,
  });
  await sync(rotateEntries(device), server, ctx(jonas));
  const keyFor = (accountId: Uint8Array) =>
    rotation.value.wrappedKeys.find((k) => idKey(k.accountId) === idKey(accountId))?.wrapped;
  return { trust, server, entries, state, rekeyed, ctx, keyFor, rotation: rotation.value };
};

describe("the server keeps serving Anna's old bundle", () => {
  it("as her current certificate: a client that saw the new one does not take it", () => {
    const seen = { [encodeBytes(anna.id)]: RENEWED_AT };
    const row = {
      id: anna.id,
      role: "member" as const,
      name: "Anna",
      xwingPublicKey: anna.xwing.publicKey,
      edPublicKey: anna.ed.publicKey,
      certificate: certificate(anna),
      invitation: null,
    };
    expect(checkMembers(root.publicKey, [row], seen)[0]?.status).toBe("invalid");
  });

  it("as her current certificate: the log's rekey no longer verifies, so the vault stays shut", async () => {
    const { entries } = await renewed();
    const replayed = { ...renewedTrust(), certificates: new Map(renewedTrust().certificates) };
    replayed.certificates.set(idKey(anna.id), certificate(anna));
    replayed.history = new Map();
    // Her own rekey, signed with the new keys, has no certificate behind it any more
    expect(verifyLog(vaultId, entries, replayed)).toEqual({
      ok: false,
      error: "uncertified-signer",
    });
  });

  it("before her rekey: a manager's rotation wraps the next key to nobody's old bundle", async () => {
    const { trust } = await renewed();
    const before = verified(logEntries, trust);
    expect(before.rotationDue).toBe(true);
    expect(
      rotateVaultKey(
        { accountId: jonas.id, edSecretKey: jonas.ed.secretKey },
        before,
        vaultId,
        trust,
        at,
        newKey,
      ),
    ).toEqual({ ok: false, error: "uncertified-member" });
  });

  it("her old keys write nothing anyone takes once the log names the new bundle", async () => {
    const { server, ctx, rotation } = await renewed();
    // Whoever holds the old keys and the new vault key still could not sign as Anna
    const forged = sealRecord(
      { id: anna.id, edSecretKey: anna.ed.secretKey },
      rotation.ring,
      id(0xe1),
      3,
      withField(bank, "password", "Gestohlen-1"),
      new Uint8Array(),
    );
    const lying = lyingServer(server, { pull: (records) => [...records, forged] });
    const pulled = await pull(emptyDevice(), lying, ctx(jonas));
    expect(pulled.refused.map((r) => r.error)).toEqual(["bad-signature"]);
  });
});

describe("the server withholds Anna's new certificate", () => {
  it("shows her as renewed and the vault without writing, with no rekey to sign", () => {
    const state = verified(logEntries, withheldTrust());
    expect(state.superseded).toEqual([idKey(anna.id)]);
    expect(state.rotationDue).toBe(true);
    expect(dueRekeys(state, withheldTrust())).toEqual([]);
  });

  it("makes every device stop writing in the vault: its key is with the old keys", async () => {
    const server = memoryServer();
    const ctx = {
      ...contextFor(jonas),
      trust: withheldTrust(),
      log: verified(logEntries, withheldTrust()),
    };
    const synced = await sync(edit(emptyDevice(), id(0xe1), bank), server, ctx);
    expect(synced.blocked).toBe("rotation-due");
    expect(server.pull()).toEqual([]);
  });

  it("from a client that saw it: her old certificate does not come back without a time limit", () => {
    // Found in review: the server lists no current certificate, only the old one as earlier
    const seen = { [encodeBytes(anna.id)]: RENEWED_AT };
    const row = {
      id: anna.id,
      role: "member" as const,
      name: "Anna",
      xwingPublicKey: annaNew.xwing.publicKey,
      edPublicKey: annaNew.ed.publicKey,
      certificate: null,
      invitation: null,
      previous: [certificate(anna)],
    };
    const view = checkMembers(root.publicKey, [row], seen)[0];
    expect(view).toMatchObject({ status: "invalid", previous: [] });
    // As trustOf builds it: nothing of hers verifies until the server serves what it hid
    const history = new Map(view?.previous?.length ? [[idKey(anna.id), view.previous]] : []);
    const hidden = { ...withheldTrust(), history };
    const oldBundle = certificateFingerprint(certificate(anna));
    expect(certificateFor(hidden, anna.id, oldBundle, at)).toBeUndefined();
  });

  it("as a certificate that does not check out: her old one does not count in its place", () => {
    // Found in review: the server lists another role, so the new certificate fails the check
    const row = {
      id: anna.id,
      role: "admin" as const,
      name: "Anna",
      xwingPublicKey: annaNew.xwing.publicKey,
      edPublicKey: annaNew.ed.publicKey,
      certificate: renewedCertificate,
      invitation: null,
      previous: [certificate(anna)],
    };
    const view = checkMembers(root.publicKey, [row], {})[0];
    expect(view).toMatchObject({ status: "invalid", previous: [] });
  });

  it("lets no log with her rekey verify", async () => {
    const { entries } = await renewed();
    expect(verifyLog(vaultId, entries, withheldTrust())).toEqual({
      ok: false,
      error: "uncertified-signer",
    });
  });
});

describe("the old kit played back after the change", () => {
  const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
    passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
  const passphrase = "Annas Passphrase lang genug";
  const old = createAccount(passphrase, emptyState(rootFingerprint(root.publicKey)), {
    derive: quick,
  });
  const stored = (upload: typeof old.upload, counter = 0): Stored => ({
    accountId: old.accountId,
    accountSalt: upload.accountSalt,
    keyBlock: upload.keyBlock,
    state: upload.state,
    stateCounter: counter,
    unlock: upload.unlock,
  });
  const rekeyed = rekeyAccount(
    {
      accountId: old.accountId,
      accountKey: old.accountKey,
      keyBlock: old.keyBlock,
      state: old.state,
      stateCounter: 0,
    },
    passphrase,
    [ring0],
    { derive: quick },
  );
  const after: Stored = { ...stored(old.upload), ...rekeyed.upload, stateCounter: 1 };

  it("opens the old AK from a kept recovery box, and with it nothing written afterwards", () => {
    const kept = unlockWithRecoveryKey(stored(old.upload), old.recoveryKey);
    if (!kept.ok) throw new Error(kept.error);
    expect(openState(kept.value.accountKey, old.accountId, 1, after.state).ok).toBe(false);
    expect(unlockWithRecoveryKey(after, old.recoveryKey)).toEqual({
      ok: false,
      error: "wrong-key",
    });
    expect(unlockWithPassphrase(after, passphrase, old.secretKey, quick)).toEqual({
      ok: false,
      error: "wrong-key",
    });
  });

  it("the old keys open no vault key and no entry of the epoch after the rotation", async () => {
    const { state, server, keyFor, ctx } = await renewed();
    const wrapped = keyFor(anna.id) as Uint8Array;
    expect(openVaultKey(blockOf(anna), anna.id, state, vaultId, 1, wrapped).ok).toBe(false);
    expect(openVaultKey(blockOf(annaNew), anna.id, state, vaultId, 1, wrapped).ok).toBe(true);
    expect(
      unwrapVaultKey(
        {
          secretKey: anna.xwing.secretKey,
          fingerprint: certificateFingerprint(certificate(anna)),
          memberId: anna.id,
        },
        wrapped,
        { vaultId, epoch: 1 },
        state.commitments.get(1) as Uint8Array,
      ).ok,
    ).toBe(false);
    // With only the old vault key, the entry written after the rotation does not open
    const stale = await pull(emptyDevice(), server, { ...ctx(anna), ring: ring0, older: [] });
    expect(stale.device.known.size).toBe(0);
    expect(stale.refused.map((r) => r.error)).toEqual(["wrong-vault"]);
  });

  it("served to Anna's device as her account: her new Secret Key does not open it", () => {
    expect(unlockWithPassphrase(stored(old.upload), passphrase, rekeyed.secretKey, quick)).toEqual({
      ok: false,
      error: "wrong-key",
    });
  });
});

describe("the server skips a vault's rotation", () => {
  it("drops the rotation after her rekey: the vault stays without writing until one comes", async () => {
    const { entries, trust } = await renewed();
    const skipped = verified(entries.slice(0, -1), trust);
    expect(skipped.superseded).toEqual([]);
    expect(skipped.rotationDue).toBe(true);
    expect(dueExits(skipped, new Set()).rotate).toBe(true);
  });

  it("drops the rotation from a log the client remembered: a rollback", async () => {
    const { entries, state, trust } = await renewed();
    expect(verifyLog(vaultId, entries.slice(0, -1), trust, remember(state))).toEqual({
      ok: false,
      error: "rollback",
    });
  });

  it("drops her rekey and the rotation: her client sees her old bundle and signs the rekey anew", async () => {
    const { trust } = await renewed();
    const skipped = verified(logEntries, trust);
    expect(skipped.superseded).toEqual([idKey(anna.id)]);
    expect(dueRekeys(skipped, trust)).toEqual([renewedCertificate]);
  });

  it("hides the rotation but serves the entry written after it: of a newer epoch, not taken", async () => {
    const { entries, server, ctx, trust } = await renewed();
    const skipped = verified(entries.slice(0, -1), trust);
    const pulled = await pull(emptyDevice(), server, {
      ...ctx(anna),
      log: skipped,
      ring: ring0,
      older: [],
    });
    expect(pulled.refused.map((r) => r.error)).toEqual(["newer-epoch"]);
  });
});

describe("what Anna wrote with her old keys before the renewal", () => {
  // Found in review: once the log names her new bundle, a device that had not pulled her last edit
  // refused it, and the rotation that follows wrote the older version over it
  it("still opens after her rekey, until the rotation, for a device that had not pulled it", async () => {
    const trust = renewedTrust();
    const server = memoryServer();
    const before = verified(logEntries, trust);
    // Written before the renewal, as the log and certificates stood then
    const written = await sync(edit(emptyDevice(), id(0xe1), bank), server, contextFor(anna));
    expect(written.device.queue).toEqual([]);
    const own = rekeyMember(
      { accountId: anna.id, edSecretKey: annaNew.ed.secretKey },
      before,
      vaultId,
      renewedCertificate,
      at,
    );
    if (!own.ok) throw new Error(own.error);
    const rekeyed = verified([...logEntries, own.value], trust);
    const pulled = await pull(emptyDevice(), server, { ...contextFor(jonas), trust, log: rekeyed });
    expect(pulled.refused).toEqual([]);
    expect(pulled.device.known.get(idKey(id(0xe1)))?.content).toEqual(bank);
  });

  it("opens no more once the rotation wrote every entry anew", async () => {
    const { server, ctx } = await renewed();
    // Whoever has the old keys and the old vault key files a new entry under the old epoch
    const forged = sealRecord(
      { id: anna.id, edSecretKey: anna.ed.secretKey },
      ring0,
      id(0xe2),
      1,
      bank,
      new Uint8Array(),
    );
    const lying = lyingServer(server, { pull: (records) => [...records, forged] });
    const pulled = await pull(emptyDevice(), lying, ctx(jonas));
    expect(pulled.refused.map((r) => r.error)).toEqual(["bad-signature"]);
  });
});
