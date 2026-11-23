/**
 * The attacks on deleting an account (K-607, P-28): the person signs their own removal where another
 * manager remains, and a server must not be able to fake it, undo it, or bring the deleted account
 * back. Each test names its attack; every client checks with verifyLog.
 */
import { describe, expect, it } from "vitest";
import { deletionPlan } from "../membership/account-deletion.ts";
import type { LogEntry } from "../membership/log-entry.ts";
import { rotateVaultKey } from "../membership/rotation.ts";
import { addMember, changeAccess, removeMember } from "../membership/vault-ops.ts";
import { idKey, type LogState, remember, verifyLog } from "../membership/verify-log.ts";
import {
  anna,
  certificate,
  jonas,
  log,
  logEntries,
  max,
  type Person,
  trust,
  vaultId,
  vaultKey,
} from "../sync/test/fixtures.ts";

const signer = (p: Person) => ({ accountId: p.id, edSecretKey: p.ed.secretKey });
const checked = (entries: LogEntry[]) => {
  const state = verifyLog(vaultId, entries, trust);
  if (!state.ok) throw new Error(state.error);
  return state.value;
};
const planOf = (state: LogState, p: Person) =>
  deletionPlan([{ id: "werkstatt", members: state.members }], idKey(p.id), trust.now);

/** Anna becomes a second manager; then Jonas deletes his account and signs his own removal */
const annaManages = changeAccess(
  signer(jonas),
  log,
  vaultId,
  anna.id,
  { role: "manage", validUntil: 0 },
  1_800_000_010,
);
const beforeDeletion = [...logEntries, annaManages];
const removeJonas = removeMember(
  signer(jonas),
  checked(beforeDeletion),
  vaultId,
  jonas.id,
  1_800_000_020,
);
const afterDeletion = [...beforeDeletion, removeJonas];

describe("deleting an account under a malicious server", () => {
  it("lets the person sign their own removal only where another manager remains", () => {
    expect(planOf(log, jonas)).toMatchObject({ "sole-manager": ["werkstatt"], leave: [] });
    expect(planOf(checked(beforeDeletion), jonas)).toMatchObject({ leave: ["werkstatt"] });
    const after = checked(afterDeletion);
    expect(after.members.has(idKey(jonas.id))).toBe(false);
    // Until Anna rotates, nobody writes under the key Jonas still knows (P-11)
    expect(after.rotationDue).toBe(true);
  });

  it("gives the new vault key to those who remain, never to the deleted account", () => {
    const rotation = rotateVaultKey(
      signer(anna),
      checked(afterDeletion),
      vaultId,
      trust,
      1_800_000_030,
    );
    if (!rotation.ok) throw new Error(rotation.error);
    const recipients = rotation.value.wrappedKeys.map((key) => idKey(key.accountId));
    expect(recipients.sort()).toEqual([idKey(anna.id), idKey(max.id)].sort());
    expect(checked([...afterDeletion, rotation.value.entry]).rotationDue).toBe(false);
  });

  it("E-06: refuses a removal the server forged in the name of someone who may not manage", () => {
    // Max reads only: a server that wants Jonas out of the vault cannot make Max sign it
    const forged = removeMember(
      signer(max),
      checked(beforeDeletion),
      vaultId,
      jonas.id,
      1_800_000_020,
    );
    const result = verifyLog(vaultId, [...beforeDeletion, forged], trust);
    expect(result).toEqual({ ok: false, error: "not-manager" });
  });

  it("E-06: refuses a removal whose signature is not the person's", () => {
    const tampered = {
      ...removeJonas,
      signature: removeJonas.signature.map((b, i) => (i === 0 ? b ^ 1 : b)),
    };
    const result = verifyLog(vaultId, [...beforeDeletion, tampered], trust);
    expect(result).toEqual({ ok: false, error: "bad-signature" });
  });

  it("E-06: the deleted account cannot add itself back with its old key", () => {
    const after = checked(afterDeletion);
    const ring = { vaultId, epoch: after.epoch, vaultKey };
    const comeback = addMember(
      signer(jonas),
      after,
      ring,
      certificate(jonas),
      { role: "manage", validUntil: 0 },
      1_800_000_040,
    ).entry;
    const result = verifyLog(vaultId, [...afterDeletion, comeback], trust);
    expect(result).toEqual({ ok: false, error: "not-manager" });
  });

  it("E-07: a client that saw the removal rejects a log rolled back to before it", () => {
    const seen = remember(checked(afterDeletion));
    const result = verifyLog(vaultId, beforeDeletion, trust, seen);
    expect(result).toEqual({ ok: false, error: "rollback" });
  });
});
