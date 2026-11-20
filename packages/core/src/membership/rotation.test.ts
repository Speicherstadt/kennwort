import { type KeyBlock, rootFingerprint, wrapVaultKey } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import {
  anna,
  certificate,
  id,
  jonas,
  log,
  logEntries,
  max,
  type Person,
  root,
  sandra,
  trust,
  vaultId,
  vaultKey,
} from "../sync/test/fixtures.ts";
import { certificateFingerprint, certify } from "./certificate.ts";
import { entryHash } from "./log-entry.ts";
import { dueExits, openRings, removeAndRotate, rotateVaultKey } from "./rotation.ts";
import { addMember } from "./vault-ops.ts";
import { idKey, verifyLog } from "./verify-log.ts";

const signer = { accountId: jonas.id, edSecretKey: jonas.ed.secretKey };
const blockOf = (p: Person): KeyBlock => ({
  xwing: p.xwing,
  ed: p.ed,
  rootFingerprint: rootFingerprint(root.publicKey),
});
const newKey = new Uint8Array(32).fill(0x66);
const at = 1_800_000_300;
const rotated = () => {
  const made = removeAndRotate(signer, log, vaultId, max.id, trust, at, newKey);
  if (!made.ok) throw new Error(made.error);
  return made.value;
};
const checkedAfter = (rotation: ReturnType<typeof rotated>) => {
  const checked = verifyLog(vaultId, [...logEntries, ...rotation.entries], trust);
  if (!checked.ok) throw new Error(checked.error);
  return checked.value;
};

describe("removeAndRotate (P-11)", () => {
  it("signs the removal and a rotation to the next epoch, a chain verifyLog accepts", () => {
    const rotation = rotated();
    const [remove, rotate] = rotation.entries;
    expect(remove).toMatchObject({ action: "remove", seq: 3, accountId: max.id });
    expect(rotate).toMatchObject({
      action: "rotate",
      seq: 4,
      epoch: 1,
      accountId: jonas.id,
      signerId: jonas.id,
      role: "",
      validUntil: 0,
      fingerprint: new Uint8Array(),
      time: at,
    });
    if (!remove || !rotate) throw new Error("two entries");
    expect(rotate.prevHash).toEqual(entryHash(remove));
    expect(rotate.lastSeen).toEqual(entryHash(remove));
    const state = checkedAfter(rotation);
    expect(state.epoch).toBe(1);
    expect(state.rotationDue).toBe(false);
    expect(state.members.has(idKey(max.id))).toBe(false);
    expect(rotation.ring).toEqual({ vaultId, epoch: 1, vaultKey: newKey });
  });

  it("wraps the new key to every remaining member, each opening it against the signed commitment", () => {
    const rotation = rotated();
    const state = checkedAfter(rotation);
    expect(rotation.wrappedKeys.map((k) => idKey(k.accountId))).toEqual(
      [jonas, anna].map((p) => idKey(p.id)),
    );
    for (const [p, wrapped] of [
      [jonas, rotation.wrappedKeys[0]],
      [anna, rotation.wrappedKeys[1]],
    ] as const) {
      const rings = openRings(blockOf(p), p.id, state, vaultId, [
        { epoch: 0, wrapped: wrapVaultKey(recipient(p), p.id, vaultKey, { vaultId, epoch: 0 }) },
        { epoch: 1, wrapped: wrapped?.wrapped ?? new Uint8Array() },
      ]);
      expect(rings).toEqual({
        ok: true,
        value: {
          current: { vaultId, epoch: 1, vaultKey: newKey },
          older: [{ vaultId, epoch: 0, vaultKey }],
        },
      });
    }
  });

  it("gives the one who left nothing of the new key", () => {
    const rotation = rotated();
    const state = checkedAfter(rotation);
    for (const wrapped of rotation.wrappedKeys)
      expect(openRings(blockOf(max), max.id, state, vaultId, [{ epoch: 1, ...wrapped }]).ok).toBe(
        false,
      );
  });

  it("draws a fresh key when none is given", () => {
    const made = removeAndRotate(signer, log, vaultId, max.id, trust, at);
    expect(made.ok && made.value.ring.vaultKey).not.toEqual(vaultKey);
    expect(made.ok && made.value.ring.vaultKey).toHaveLength(32);
  });

  it("removes only a member", () => {
    expect(removeAndRotate(signer, log, vaultId, sandra.id, trust, at)).toEqual({
      ok: false,
      error: "not-member",
    });
  });
});

const recipient = (p: Person) => ({
  publicKey: p.xwing.publicKey,
  fingerprint: certificateFingerprint(certificate(p)),
});

describe("rotateVaultKey wraps only to certified members (E-05)", () => {
  const without = (p: Person) => ({
    ...trust,
    certificates: new Map([...trust.certificates].filter(([key]) => key !== idKey(p.id))),
  });

  it("rotates without anyone leaving, for every member of the log", () => {
    const made = rotateVaultKey(signer, log, vaultId, trust, at, newKey);
    if (!made.ok) throw new Error(made.error);
    expect(made.value.wrappedKeys).toHaveLength(3);
    expect(made.value.entry.seq).toBe(3);
    expect(made.value.entry.prevHash).toEqual(log.hash);
    const state = verifyLog(vaultId, [...logEntries, made.value.entry], trust);
    expect(state.ok && state.value.epoch).toBe(1);
  });

  it("refuses when a member's certificate is missing", () => {
    expect(rotateVaultKey(signer, log, vaultId, without(anna), at)).toEqual({
      ok: false,
      error: "uncertified-member",
    });
  });

  it("refuses a certificate the root did not sign, or for other keys than the log names", () => {
    const forged = certify(new Uint8Array(32).fill(9), { ...certificate(anna) });
    const otherKeys = certify(root.secretKey, {
      ...certificate(anna),
      xwingPublicKey: sandra.xwing.publicKey,
    });
    for (const replaced of [forged, otherKeys]) {
      const lying = {
        ...trust,
        certificates: new Map(trust.certificates).set(idKey(anna.id), replaced),
      };
      expect(rotateVaultKey(signer, log, vaultId, lying, at).ok).toBe(false);
    }
  });

  it("refuses a certificate for another account filed under a member's ID, even with her keys", () => {
    const stranger = id(0x77);
    const borrowed = certify(root.secretKey, { ...certificate(anna), accountId: stranger });
    const lying = {
      ...trust,
      certificates: new Map(trust.certificates)
        .set(idKey(anna.id), borrowed)
        .set(idKey(stranger), borrowed),
    };
    expect(rotateVaultKey(signer, log, vaultId, lying, at)).toEqual({
      ok: false,
      error: "uncertified-member",
    });
  });

  it("refuses a certificate filed under another member's ID", () => {
    const swapped = {
      ...trust,
      certificates: new Map(trust.certificates).set(idKey(anna.id), certificate(sandra)),
    };
    expect(rotateVaultKey(signer, log, vaultId, swapped, at).ok).toBe(false);
  });
});

describe("openRings: the keys the server hands out, checked against the log", () => {
  const state = () => checkedAfter(rotated());
  const keyOf = (_: Person, index: number) =>
    rotated().wrappedKeys[index]?.wrapped ?? new Uint8Array();

  it("refuses when the key of the newest epoch is withheld (E-26)", () => {
    const old = wrapVaultKey(recipient(anna), anna.id, vaultKey, { vaultId, epoch: 0 });
    expect(
      openRings(blockOf(anna), anna.id, state(), vaultId, [{ epoch: 0, wrapped: old }]),
    ).toEqual({
      ok: false,
      error: "key-withheld",
    });
  });

  it("refuses the old key passed off as the new epoch's (E-16, E-26)", () => {
    const old = wrapVaultKey(recipient(anna), anna.id, vaultKey, { vaultId, epoch: 1 });
    expect(
      openRings(blockOf(anna), anna.id, state(), vaultId, [{ epoch: 1, wrapped: old }]),
    ).toEqual({
      ok: false,
      error: "not-committed",
    });
  });

  it("refuses a key of an epoch the log does not show: the log was cut short (E-07)", () => {
    const old = wrapVaultKey(recipient(anna), anna.id, vaultKey, { vaultId, epoch: 0 });
    const keys = [
      { epoch: 0, wrapped: old },
      { epoch: 1, wrapped: keyOf(anna, 1) },
    ];
    expect(openRings(blockOf(anna), anna.id, log, vaultId, keys)).toEqual({
      ok: false,
      error: "no-epoch",
    });
  });

  it("refuses when an older key is not the one its epoch committed to", () => {
    const wrong = wrapVaultKey(recipient(anna), anna.id, newKey, { vaultId, epoch: 0 });
    expect(
      openRings(blockOf(anna), anna.id, state(), vaultId, [
        { epoch: 0, wrapped: wrong },
        { epoch: 1, wrapped: keyOf(anna, 1) },
      ]),
    ).toEqual({ ok: false, error: "not-committed" });
  });
});

describe("dueExits: what a manager's client still owes after someone left", () => {
  it("names members who left the company and asks for a rotation", () => {
    expect(dueExits(log, new Set([idKey(max.id), idKey(sandra.id)]))).toEqual({
      remove: [idKey(max.id)],
      rotate: true,
    });
  });

  it("asks for a rotation when a removal was not followed by one", () => {
    const remove = removeAndRotate(signer, log, vaultId, max.id, trust, at);
    if (!remove.ok) throw new Error(remove.error);
    const removedOnly = verifyLog(
      vaultId,
      [...logEntries, remove.value.entries[0] as never],
      trust,
    );
    if (!removedOnly.ok) throw new Error(removedOnly.error);
    expect(dueExits(removedOnly.value, new Set())).toEqual({ remove: [], rotate: true });
  });

  it("owes nothing when no one left", () => {
    expect(dueExits(log, new Set())).toEqual({ remove: [], rotate: false });
    expect(dueExits(checkedAfter(rotated()), new Set([idKey(max.id)]))).toEqual({
      remove: [],
      rotate: false,
    });
  });
});

describe("rotation after a member joined later", () => {
  it("wraps to the member added in the current epoch as well", () => {
    const added = addMember(
      signer,
      log,
      { vaultId, epoch: 0, vaultKey },
      certificate(sandra),
      {
        role: "read",
        validUntil: 0,
      },
      1_800_000_250,
    );
    const withSandra = verifyLog(vaultId, [...logEntries, added.entry], trust);
    if (!withSandra.ok) throw new Error(withSandra.error);
    const made = rotateVaultKey(signer, withSandra.value, vaultId, trust, at, newKey);
    expect(made.ok && made.value.wrappedKeys.map((k) => idKey(k.accountId))).toContain(
      idKey(sandra.id),
    );
  });
});
