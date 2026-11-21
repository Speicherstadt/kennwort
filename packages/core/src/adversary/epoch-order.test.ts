/**
 * Versions of an older epoch after a key rotation (P-11, review of K-307): a server that forks a
 * remaining member's view of the log, so she keeps writing under the old vault key, and then serves
 * those versions to members who already hold the entry in the new epoch (E-08, E-13, E-26). The
 * versions are genuine – signed by a current editor, bound to entry, vault, version and epoch – but
 * the person who left can read them, and they carry none of the change marks of the rotation.
 */
import { describe, expect, it } from "vitest";
import { pastExposures } from "../membership/exit-report.ts";
import type { LogEntry } from "../membership/log-entry.ts";
import { removeAndRotate } from "../membership/rotation.ts";
import { changeAccess } from "../membership/vault-ops.ts";
import { idKey, type LogState, verifyLog } from "../membership/verify-log.ts";
import { encodeBytes } from "../sync/bytes.ts";
import { edit, emptyDevice, pull, rotateEntries, sync } from "../sync/device.ts";
import { memoryServer } from "../sync/memory-server.ts";
import { type EntryRecord, openRecord, sealRecord } from "../sync/record.ts";
import {
  anna,
  bank,
  contextFor,
  id,
  jonas,
  log,
  logEntries,
  max,
  type Person,
  trust,
  vaultId,
  vaultKey,
  withField,
} from "../sync/test/fixtures.ts";
import { lyingServer } from "./lying-server.ts";

const e1 = id(0xe1);
const ring0 = { vaultId, epoch: 0, vaultKey };
const newKey = new Uint8Array(32).fill(0x66);
const jonasSigner = { accountId: jonas.id, edSecretKey: jonas.ed.secretKey };
const maxMark = { account: encodeBytes(max.id), at: 1_800_000_300, fields: ["password"] };

/** Max leaves the vault as the log stands; Jonas signs the removal and the rotation */
const leave = (before: LogState, entries: LogEntry[]) => {
  const made = removeAndRotate(jonasSigner, before, vaultId, max.id, trust, 1_800_000_300, newKey);
  if (!made.ok) throw new Error(made.error);
  const all = [...entries, ...made.value.entries];
  const checked = verifyLog(vaultId, all, trust);
  if (!checked.ok) throw new Error(checked.error);
  const ctx = (p: Person) => ({
    ...contextFor(p),
    ring: made.value.ring,
    older: [ring0],
    log: checked.value,
    lastSeen: checked.value.hash,
    exposures: pastExposures(all),
  });
  return { ctx, state: checked.value };
};

/**
 * Jonas saves the bank login (version 1, epoch 0); Max leaves; Jonas's device writes it again as
 * version 2 in epoch 1, marked for Max. The server keeps version 1 for its fork.
 */
const rotated = async () => {
  const server = memoryServer();
  const first = await sync(edit(emptyDevice(), e1, bank), server, contextFor(jonas));
  const [v1] = server.pull() as [EntryRecord];
  const { ctx } = leave(log, logEntries);
  const exposure = { account: encodeBytes(max.id), at: 1_800_000_300, epochs: [0] };
  const jonasDevice = (await sync(rotateEntries(first.device, exposure), server, ctx(jonas)))
    .device;
  return { server, v1, ctx, jonasDevice };
};

/**
 * The fork: the server shows Anna the log from before the exit and version 1. Her device does what
 * an honest one does with that view: she changes the user name, then the password, each synced
 * under the only key she knows, epoch 0. The server takes both into its fork.
 */
const forked = async (v1: EntryRecord) => {
  const fork = memoryServer();
  fork.push(v1);
  const annaOld = contextFor(anna);
  let device = (await pull(emptyDevice(), fork, annaOld)).device;
  device = (await sync(edit(device, e1, withField(bank, "user", "anna")), fork, annaOld)).device;
  const changed = withField(withField(bank, "user", "anna"), "password", "Neu-2026!");
  await sync(edit(device, e1, changed), fork, annaOld);
  const [v3] = fork.pull() as [EntryRecord];
  return v3;
};

describe("a remaining member's versions under the old key, served after the rotation", () => {
  it("are genuine and readable for Max: signed by Anna, sealed in epoch 0, version 3", async () => {
    const { v1 } = await rotated();
    const v3 = await forked(v1);
    expect([v3.version, v3.epoch]).toEqual([3, 0]);
    // Max kept the vault key of epoch 0 and the log he last saw: he reads Anna's new password
    const read = openRecord(v3, ring0, log, trust, 0);
    expect(read.ok && read.value.fields.find((f) => f.id === "password")?.value).toBe("Neu-2026!");
  });

  it("(a, c) Jonas, who holds the entry in epoch 1, refuses the newer version of epoch 0", async () => {
    const { server, v1, ctx, jonasDevice } = await rotated();
    const v3 = await forked(v1);
    const lying = lyingServer(server, { pull: () => [v3] });
    const pulled = await pull(jonasDevice, lying, ctx(jonas));
    expect(pulled.refused).toEqual([{ entryId: e1, version: 3, error: "older-epoch" }]);
    const known = pulled.device.known.get(idKey(e1));
    expect([known?.version, known?.key?.epoch]).toEqual([2, 1]);
    // The rotation's mark for Max stays where Jonas sees it
    expect(known?.content.toChange).toEqual([maxMark]);
  });

  it("(a) and a sync does not write on top of it: the change stays queued", async () => {
    const { server, v1, ctx, jonasDevice } = await rotated();
    const v3 = await forked(v1);
    // The server took Anna's version 3 as the newest; it shows it to Jonas and refuses version 3
    const lying = lyingServer(server, {
      pull: () => [v3],
      push: () => ({ ok: false, current: v3 }),
    });
    const changed = edit(jonasDevice, e1, withField(bank, "user", "jonas"));
    const synced = await sync(changed, lying, ctx(jonas));
    expect(synced.refused.map((r) => r.error)).toEqual(["older-epoch"]);
    expect(synced.device.queue).toHaveLength(1);
    expect(synced.device.known.get(idKey(e1))?.version).toBe(2);
  });

  it("(b) a device that never saw epoch 1 of the entry takes it, but its next write leaves Max out and marks the password", async () => {
    // A new device of Anna's knows the rotated log but nothing of the entry: it cannot tell, the
    // residual risk of P-09 (a server can withhold the newest version from a client that never saw it)
    const { server, v1, ctx } = await rotated();
    const v3 = await forked(v1);
    const lying = lyingServer(server, { pull: (records) => records.map(() => v3) });
    const taken = await pull(emptyDevice(), lying, ctx(anna));
    expect(taken.device.known.get(idKey(e1))?.key?.epoch).toBe(0);
    // The server keeps up the lie and takes the next version on top of Anna's version 3
    let held: EntryRecord = v3;
    const fresh = {
      pull: () => [held],
      push: (record: EntryRecord) => {
        held = record;
        return { ok: true as const };
      },
    };
    const content = taken.device.known.get(idKey(e1))?.content ?? bank;
    const changed = edit(taken.device, e1, withField(content, "url", "https://s.test"));
    const synced = await sync(changed, fresh, ctx(anna));
    const v4 = held;
    expect([v4.version, v4.epoch]).toEqual([4, 1]);
    // Max's old vault key opens nothing written after it, even told the newer log
    expect(openRecord(v4, { ...ring0, epoch: 1 }, ctx(max).log, trust, 0)).toEqual({
      ok: false,
      error: "unreadable",
    });
    expect(synced.device.known.get(idKey(e1))?.content.toChange).toEqual([maxMark]);
  });

  it("a member's change queued offline before she learned of the rotation is sealed under the new key", async () => {
    const { server, v1, ctx } = await rotated();
    const old = memoryServer();
    old.push(v1);
    const offline = (await pull(emptyDevice(), old, contextFor(anna))).device;
    const queued = edit(offline, e1, withField(bank, "user", "anna"));
    // Back online she learns the rotated log first, then syncs: merged onto version 2, in epoch 1
    const synced = await sync(queued, server, ctx(anna));
    expect(synced.device.queue).toEqual([]);
    const [record] = server.pull() as [EntryRecord];
    expect([record.version, record.epoch]).toEqual([3, 1]);
    expect(synced.device.known.get(idKey(e1))?.content.toChange).toEqual([maxMark]);
  });
});

describe("a member who could edit in the old epoch and left", () => {
  /** Max is an editor in epoch 0, writes version 2, then leaves; Jonas rotates to version 3 */
  const editorLeft = async () => {
    const promote = changeAccess(
      jonasSigner,
      log,
      vaultId,
      max.id,
      { role: "edit", validUntil: 0 },
      1_800_000_050,
    );
    const entries = [...logEntries, promote];
    const promoted = verifyLog(vaultId, entries, trust);
    if (!promoted.ok) throw new Error(promoted.error);
    const asEditor = (p: Person) => ({
      ...contextFor(p),
      log: promoted.value,
      lastSeen: promoted.value.hash,
    });
    const server = memoryServer();
    await sync(edit(emptyDevice(), e1, bank), server, asEditor(jonas));
    const maxDevice = (await pull(emptyDevice(), server, asEditor(max))).device;
    await sync(edit(maxDevice, e1, withField(bank, "user", "max")), server, asEditor(max));
    const [v2] = server.pull() as [EntryRecord];
    const { ctx } = leave(promoted.value, entries);
    const jonasDevice = (await pull(emptyDevice(), server, asEditor(jonas))).device;
    const exposure = { account: encodeBytes(max.id), at: 1_800_000_300, epochs: [0] };
    await sync(rotateEntries(jonasDevice, exposure), server, ctx(jonas));
    return { server, v2, ctx };
  };

  it("what Max signs under the old key after leaving is refused, newer version or not", async () => {
    const { server, ctx } = await editorLeft();
    for (const version of [4, 9]) {
      const late = sealRecord(
        { id: max.id, edSecretKey: max.ed.secretKey },
        ring0,
        e1,
        version,
        withField(bank, "password", "Max-war-hier"),
        new Uint8Array(),
      );
      const lying = lyingServer(server, { pull: () => [late] });
      // A remaining device that holds version 3 and a new device that holds nothing
      for (const device of [(await pull(emptyDevice(), server, ctx(anna))).device, emptyDevice()])
        expect((await pull(device, lying, ctx(anna))).refused.map((r) => r.error)).toEqual([
          "not-editor",
        ]);
    }
  });

  it("his version from while he could edit, replayed after he left, is no news or not his to write any more", async () => {
    const { server, v2, ctx } = await editorLeft();
    const lying = lyingServer(server, { pull: () => [v2] });
    const holding = (await pull(emptyDevice(), server, ctx(anna))).device;
    expect((await pull(holding, lying, ctx(anna))).refused.map((r) => r.error)).toEqual([
      "rollback",
    ]);
    expect((await pull(emptyDevice(), lying, ctx(anna))).refused.map((r) => r.error)).toEqual([
      "not-editor",
    ]);
  });
});
