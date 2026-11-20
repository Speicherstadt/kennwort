/**
 * The attacks on leaving (P-11, K-307): a server that withholds the key rotation, hands the old
 * vault key to the member who left or rolls the log back to before the exit (E-07, E-16, E-26 of
 * the catalog after the ETH study). Each test names its attack; the client must notice it.
 */
import { type KeyBlock, rootFingerprint, wrapVaultKey } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { certificateFingerprint } from "../membership/certificate.ts";
import type { LogEntry } from "../membership/log-entry.ts";
import { dueExits, openRings, removeAndRotate } from "../membership/rotation.ts";
import { idKey, remember, verifyLog } from "../membership/verify-log.ts";
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
  log,
  logEntries,
  max,
  type Person,
  root,
  trust,
  vaultId,
  vaultKey,
  withField,
} from "../sync/test/fixtures.ts";
import { lyingServer } from "./lying-server.ts";

const ring0 = { vaultId, epoch: 0, vaultKey };
const newKey = new Uint8Array(32).fill(0x66);
const blockOf = (p: Person): KeyBlock => ({
  xwing: p.xwing,
  ed: p.ed,
  rootFingerprint: rootFingerprint(root.publicKey),
});
const wrapOld = (p: Person, epoch: number) =>
  wrapVaultKey(
    { publicKey: p.xwing.publicKey, fingerprint: certificateFingerprint(certificate(p)) },
    p.id,
    vaultKey,
    { vaultId, epoch },
  );

/** Jonas saved the bank login; Max (reader) leaves, Jonas rotates and writes it again */
const exited = async () => {
  const made = removeAndRotate(
    { accountId: jonas.id, edSecretKey: jonas.ed.secretKey },
    log,
    vaultId,
    max.id,
    trust,
    1_800_000_300,
    newKey,
  );
  if (!made.ok) throw new Error(made.error);
  const entries: LogEntry[] = [...logEntries, ...made.value.entries];
  const checked = verifyLog(vaultId, entries, trust);
  if (!checked.ok) throw new Error(checked.error);
  const state = checked.value;
  const server = memoryServer();
  const device = (await sync(edit(emptyDevice(), id(0xe1), bank), server, contextFor(jonas)))
    .device;
  const ctx = (p: Person) => ({
    ...contextFor(p),
    ring: made.value.ring,
    older: [ring0],
    log: state,
    lastSeen: state.hash,
  });
  const exposure = { account: encodeBytes(max.id), at: 1_800_000_300, epochs: [0] };
  await sync(rotateEntries(device, exposure), server, ctx(jonas));
  const keyFor = (p: Person) =>
    made.value.wrappedKeys.find((k) => idKey(k.accountId) === idKey(p.id))?.wrapped;
  return { entries, state, server, ctx, keyFor, rotation: made.value };
};

describe("E-26 the server withholds the rotation", () => {
  it("shows the removal without its rotation: the client knows the key is exposed", async () => {
    const { entries } = await exited();
    const withheld = verifyLog(vaultId, entries.slice(0, -1), trust);
    expect(withheld.ok && withheld.value.rotationDue).toBe(true);
    expect(withheld.ok && dueExits(withheld.value, new Set())).toEqual({
      remove: [],
      rotate: true,
    });
  });

  it("cuts the rotation from a log the client remembered: a rollback", async () => {
    const { entries, state } = await exited();
    expect(verifyLog(vaultId, entries.slice(0, -1), trust, remember(state))).toEqual({
      ok: false,
      error: "rollback",
    });
  });

  it("hides the rotation but serves the re-encrypted entries: they are of a newer epoch", async () => {
    const { entries, server } = await exited();
    const withheld = verifyLog(vaultId, entries.slice(0, -1), trust);
    if (!withheld.ok) throw new Error(withheld.error);
    const pulled = await pull(emptyDevice(), server, { ...contextFor(anna), log: withheld.value });
    expect(pulled.refused.map((r) => r.error)).toEqual(["newer-epoch"]);
    expect(pulled.device.known.size).toBe(0);
  });

  it("shows the rotation but withholds Anna's new key: she does not take the old one", async () => {
    const { state } = await exited();
    expect(
      openRings(blockOf(anna), anna.id, state, vaultId, [{ epoch: 0, wrapped: wrapOld(anna, 0) }]),
    ).toEqual({ ok: false, error: "key-withheld" });
  });

  it("and if she still holds only the old key, her device writes nothing under it", async () => {
    const { state, server } = await exited();
    const stale = { ...contextFor(anna), log: state, lastSeen: state.hash, older: [] };
    const known = (await pull(emptyDevice(), server, stale)).device;
    const synced = await sync(edit(known, id(0xe2), bank), server, stale);
    expect(synced.blocked).toBe("stale-key");
    expect(server.pull()).toHaveLength(1);
  });
});

describe("E-26 the server serves the old key to the member who left", () => {
  it("Max opens no entry written after the rotation with the old vault key", async () => {
    const { server } = await exited();
    // His device still trusts the log it last saw, from before his removal
    const pulled = await pull(emptyDevice(), server, contextFor(max));
    expect(pulled.refused.map((r) => r.error)).toEqual(["newer-epoch"]);
    // Even told the newer log, the old key opens none of it
    const { state } = await exited();
    const told = await pull(emptyDevice(), server, { ...contextFor(max), log: state });
    expect(told.refused.map((r) => r.error)).toEqual(["wrong-vault"]);
    expect(told.device.known.size).toBe(0);
  });

  it("Max can open no key of the new epoch, whichever member's the server gives him", async () => {
    const { state, keyFor } = await exited();
    for (const p of [jonas, anna])
      expect(
        openRings(blockOf(max), max.id, state, vaultId, [
          { epoch: 0, wrapped: wrapOld(max, 0) },
          { epoch: 1, wrapped: keyFor(p) as Uint8Array },
        ]).ok,
      ).toBe(false);
  });

  it("the old key passed off as the new epoch's is refused by a remaining member (E-16)", async () => {
    const { state, keyFor } = await exited();
    expect(
      openRings(blockOf(anna), anna.id, state, vaultId, [{ epoch: 1, wrapped: wrapOld(anna, 1) }]),
    ).toEqual({ ok: false, error: "not-committed" });
    expect(
      openRings(blockOf(anna), anna.id, state, vaultId, [
        { epoch: 1, wrapped: keyFor(anna) as Uint8Array },
      ]).ok,
    ).toBe(true);
  });

  it("what Max writes under the old key after leaving is refused by Anna", async () => {
    const { server, ctx } = await exited();
    const late = sealRecord(
      { id: max.id, edSecretKey: max.ed.secretKey },
      ring0,
      id(0xe1),
      3,
      withField(bank, "password", "Max-war-hier"),
      new Uint8Array(),
    );
    const lying = lyingServer(server, { pull: (records) => records.map(() => late) });
    const pulled = await pull(emptyDevice(), lying, ctx(anna));
    expect(pulled.refused.map((r) => r.error)).toEqual(["not-editor"]);
  });
});

describe("E-07 the server rolls the log back to before the exit", () => {
  it("is refused by every member who remembered the newer state", async () => {
    const { state } = await exited();
    for (const before of [logEntries, logEntries.slice(0, 2)])
      expect(verifyLog(vaultId, before, trust, remember(state))).toEqual({
        ok: false,
        error: "rollback",
      });
  });

  it("gives a member who remembered nothing the old epoch, but the entries give it away", async () => {
    const { server } = await exited();
    const pulled = await pull(emptyDevice(), server, contextFor(anna));
    expect(pulled.refused.map((r) => r.error)).toEqual(["newer-epoch"]);
  });

  it("keeps the old key and the removed member's place, but a key of the newer epoch is refused", async () => {
    const { keyFor } = await exited();
    expect(
      openRings(blockOf(anna), anna.id, log, vaultId, [
        { epoch: 0, wrapped: wrapOld(anna, 0) },
        { epoch: 1, wrapped: keyFor(anna) as Uint8Array },
      ]),
    ).toEqual({ ok: false, error: "no-epoch" });
  });
});
