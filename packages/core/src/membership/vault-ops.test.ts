import { ed25519KeyPair, type KeyBlock, rootFingerprint, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { certify } from "./certificate.ts";
import { addMember, changeAccess, createVault, openVaultKey, removeMember } from "./vault-ops.ts";
import { idKey, type Trust, verifyLog } from "./verify-log.ts";

// K-305 part 1 (P-05, P-06): Jonas creates "Büro", adds Anna, changes and ends her access
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const person = (byte: number) => {
  const xwing = xwingKeyPair(new Uint8Array(32).fill(byte));
  const ed = ed25519KeyPair(new Uint8Array(32).fill(byte));
  const id = new Uint8Array(16).fill(byte);
  const certificate = certify(root.secretKey, {
    accountId: id,
    xwingPublicKey: xwing.publicKey,
    edPublicKey: ed.publicKey,
    companyId: new Uint8Array(16).fill(0xc0),
    role: "member",
    issuedAt: 1,
  });
  const keyBlock: KeyBlock = { xwing, ed, rootFingerprint: rootFingerprint(root.publicKey) };
  return { id, certificate, keyBlock, signer: { accountId: id, edSecretKey: ed.secretKey } };
};
const jonas = person(0x10);
const anna = person(0x20);
const trust: Trust = {
  rootPublicKey: root.publicKey,
  certificates: new Map([jonas, anna].map((p) => [idKey(p.id), p.certificate])),
  now: 2_000,
};
const counter = () => {
  let n = 0;
  return (length: number) => new Uint8Array(length).fill(++n);
};

const buero = () => {
  const made = createVault(jonas.signer, jonas.certificate, 1_000, counter());
  const log = verifyLog(made.ring.vaultId, [made.genesis], trust);
  if (!log.ok) throw new Error(log.error);
  return { ...made, state: log.value };
};

describe("createVault", () => {
  it("makes a vault with Jonas as manager and his copy of the key", () => {
    const { ring, genesis, wrappedKey, state } = buero();
    expect(ring.vaultId).toEqual(new Uint8Array(16).fill(1));
    expect(ring.epoch).toBe(0);
    expect(genesis).toMatchObject({ action: "create", role: "manage", seq: 0, time: 1_000 });
    expect(state.members.get(idKey(jonas.id))?.role).toBe("manage");
    const opened = openVaultKey(jonas.keyBlock, jonas.id, state, ring.vaultId, 0, wrappedKey);
    expect(opened).toEqual({ ok: true, value: ring });
  });

  it("picks a new vault ID and key every time by default", () => {
    const a = createVault(jonas.signer, jonas.certificate, 1);
    const b = createVault(jonas.signer, jonas.certificate, 1);
    expect(a.ring.vaultId).toHaveLength(16);
    expect(a.ring.vaultId).not.toEqual(b.ring.vaultId);
    expect(a.ring.vaultKey).not.toEqual(b.ring.vaultKey);
  });
});

describe("members", () => {
  it("adds Anna with a role and a time limit; she opens the key the log commits to", () => {
    const v = buero();
    const added = addMember(
      jonas.signer,
      v.state,
      v.ring,
      anna.certificate,
      { role: "edit", validUntil: 1_900 },
      1_100,
    );
    const log = verifyLog(v.ring.vaultId, [v.genesis, added.entry], trust);
    if (!log.ok) throw new Error(log.error);
    expect(log.value.members.get(idKey(anna.id))).toMatchObject({
      role: "edit",
      validUntil: 1_900,
    });
    expect(
      openVaultKey(anna.keyBlock, anna.id, log.value, v.ring.vaultId, 0, added.wrappedKey),
    ).toEqual({
      ok: true,
      value: v.ring,
    });
  });

  it("changes Anna's role and then removes her, each checked by verifyLog", () => {
    const v = buero();
    const added = addMember(
      jonas.signer,
      v.state,
      v.ring,
      anna.certificate,
      { role: "edit", validUntil: 0 },
      1_100,
    );
    const afterAdd = verifyLog(v.ring.vaultId, [v.genesis, added.entry], trust);
    if (!afterAdd.ok) throw new Error(afterAdd.error);
    const changed = changeAccess(
      jonas.signer,
      afterAdd.value,
      v.ring.vaultId,
      anna.id,
      { role: "read", validUntil: 1_500 },
      1_200,
    );
    const afterRole = verifyLog(v.ring.vaultId, [v.genesis, added.entry, changed], trust);
    if (!afterRole.ok) throw new Error(afterRole.error);
    expect(afterRole.value.members.get(idKey(anna.id))).toMatchObject({
      role: "read",
      validUntil: 1_500,
    });
    const removed = removeMember(jonas.signer, afterRole.value, v.ring.vaultId, anna.id, 1_300);
    const afterRemove = verifyLog(
      v.ring.vaultId,
      [v.genesis, added.entry, changed, removed],
      trust,
    );
    if (!afterRemove.ok) throw new Error(afterRemove.error);
    expect(afterRemove.value.members.has(idKey(anna.id))).toBe(false);
    expect(removed).toMatchObject({ action: "remove", role: "", validUntil: 0, seq: 3 });
  });
});

describe("openVaultKey", () => {
  it("refuses an epoch the log does not know, someone else's copy and a key the log does not commit to", () => {
    const v = buero();
    expect(
      openVaultKey(jonas.keyBlock, jonas.id, v.state, v.ring.vaultId, 1, v.wrappedKey),
    ).toEqual({
      ok: false,
      error: "no-epoch",
    });
    expect(openVaultKey(anna.keyBlock, anna.id, v.state, v.ring.vaultId, 0, v.wrappedKey)).toEqual({
      ok: false,
      error: "not-authentic",
    });
    // The server wraps a key of its own for Jonas: it opens, but the log commits to another
    const forged = createVault(jonas.signer, jonas.certificate, 1, () => v.ring.vaultId);
    expect(
      openVaultKey(jonas.keyBlock, jonas.id, v.state, v.ring.vaultId, 0, forged.wrappedKey),
    ).toEqual({
      ok: false,
      error: "not-committed",
    });
  });
});
