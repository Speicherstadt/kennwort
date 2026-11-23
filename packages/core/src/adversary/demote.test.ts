/**
 * Reducing an editor to reading (P-09, P-06): a record counts only while its author may edit now,
 * so Jonas's client first writes every entry whose newest version Anna wrote again under his own
 * signature, then signs the role entry, then writes anew what Anna got in between (resave.ts). The
 * entries stay readable for everyone; what Anna writes afterwards is refused; a server can neither
 * backdate a version, nor bring back an older one, nor get Jonas's client to sign one that does not
 * count (E-05, E-13).
 */
import { describe, expect, it } from "vitest";
import { entryHash, type LogEntry } from "../membership/log-entry.ts";
import { changeAccess } from "../membership/vault-ops.ts";
import { idKey, verifyLog } from "../membership/verify-log.ts";
import { type Device, edit, emptyDevice, pull, type SyncContext, sync } from "../sync/device.ts";
import { memoryServer, type SyncServer } from "../sync/memory-server.ts";
import { type EntryRecord, sealRecord } from "../sync/record.ts";
import { refusedByReaders, resaveBy, restoreRefused, writtenByReaders } from "../sync/resave.ts";
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
  withField,
} from "../sync/test/fixtures.ts";
import { flipByte, lyingServer } from "./lying-server.ts";

const byAnna = id(0xe1);
const byJonas = id(0xe2);
const signer = { accountId: jonas.id, edSecretKey: jonas.ed.secretKey };
const asAuthor = (p: Person) => ({ id: p.id, edSecretKey: p.ed.secretKey });
const demotion = changeAccess(
  signer,
  log,
  vaultId,
  anna.id,
  { role: "read", validUntil: 0 },
  1_800_000_010,
);
const demotedLog = (() => {
  const entries: LogEntry[] = [...logEntries, demotion];
  const checked = verifyLog(vaultId, entries, trust);
  if (!checked.ok) throw new Error(checked.error);
  return checked.value;
})();
const after = (p: Person): SyncContext => ({
  ...contextFor(p),
  log: demotedLog,
  lastSeen: entryHash(demotion),
});

/** Anna saved the bank login, Jonas another entry; Jonas's device has pulled both */
const saved = async () => {
  const server = memoryServer();
  await sync(edit(emptyDevice(), byAnna, bank), server, contextFor(anna));
  const other = withField(bank, "user", "jonas");
  const jonasDevice = (await sync(edit(emptyDevice(), byJonas, other), server, contextFor(jonas)))
    .device;
  return { server, jonasDevice };
};

/** Step 1, before the role entry: Jonas writes Anna's entries again under his signature */
const resave = async (server: SyncServer, device: Device) =>
  (await sync(resaveBy(device, await server.pull(), anna.id), server, contextFor(jonas))).device;

/** Step 3, after the role entry, now or when a later unlock catches up */
const restore = async (server: SyncServer, device: Device) => {
  const pulled = await pull(device, server, after(jonas));
  const ids = writtenByReaders(await server.pull(), after(jonas));
  const histories = await Promise.all(ids.map(async (e) => (await server.versions?.(e)) ?? []));
  return sync(restoreRefused(pulled.device, histories, after(jonas)), server, after(jonas));
};

const freshPull = (server: SyncServer, p: Person) => pull(emptyDevice(), server, after(p));

describe("reducing an editor to reading", () => {
  it("without the re-save, her entries would be refused for everyone: the check is 'may edit now'", async () => {
    const { server } = await saved();
    expect((await freshPull(server, max)).refused).toEqual([
      { entryId: byAnna, version: 1, error: "not-editor" },
    ]);
  });

  it("keeps her entries readable for everyone, written again under the manager's signature", async () => {
    const { server, jonasDevice } = await saved();
    await resave(server, jonasDevice);
    for (const p of [jonas, anna, max]) {
      const { device, refused } = await freshPull(server, p);
      expect(refused).toEqual([]);
      expect(device.known.get(idKey(byAnna))?.content).toEqual(bank);
    }
    const latest = await server.pull();
    expect(latest.map((r) => [idKey(r.entryId), r.version, idKey(r.author)])).toEqual([
      [idKey(byAnna), 2, idKey(jonas.id)],
      [idKey(byJonas), 1, idKey(jonas.id)],
    ]);
  });

  it("re-saves only what the device took as it is", async () => {
    const { server, jonasDevice } = await saved();
    const unknown = sealRecord(
      asAuthor(anna),
      contextFor(anna).ring,
      id(0xe3),
      1,
      bank,
      new Uint8Array(),
    );
    const queued = resaveBy(jonasDevice, [...(await server.pull()), unknown], anna.id);
    expect(queued.queue.map((op) => idKey(op.entryId))).toEqual([idKey(byAnna)]);
  });

  it("refuses the version she writes between the re-save and the role entry, and writes the entry anew above it", async () => {
    const { server, jonasDevice } = await saved();
    const device = await resave(server, jonasDevice);
    // Still an editor for a moment: the server takes it
    const racing = withField(bank, "password", "Anna-war-schneller");
    expect(
      server.push(
        sealRecord(
          asAuthor(anna),
          contextFor(anna).ring,
          byAnna,
          3,
          racing,
          contextFor(anna).lastSeen,
        ),
      ).ok,
    ).toBe(true);
    expect((await freshPull(server, max)).refused).toEqual([
      { entryId: byAnna, version: 3, error: "not-editor" },
    ]);
    const restored = await restore(server, device);
    expect(restored.device.queue).toEqual([]);
    for (const p of [jonas, anna, max]) {
      const { device: fresh, refused } = await freshPull(server, p);
      expect(refused).toEqual([]);
      expect(fresh.known.get(idKey(byAnna))).toMatchObject({ version: 4, content: bank });
    }
  });

  it("catches up after going offline between the role entry and the restore, with nothing in memory", async () => {
    const { server, jonasDevice } = await saved();
    await resave(server, jonasDevice);
    const racing = withField(bank, "password", "Anna-war-schneller");
    server.push(
      sealRecord(
        asAuthor(anna),
        contextFor(anna).ring,
        byAnna,
        3,
        racing,
        contextFor(anna).lastSeen,
      ),
    );
    // A new unlock: the device starts empty and learns everything from the server's versions
    const restored = await restore(server, emptyDevice());
    expect(restored.refused).toEqual([{ entryId: byAnna, version: 3, error: "not-editor" }]);
    const { device, refused } = await freshPull(server, max);
    expect(refused).toEqual([]);
    expect(device.known.get(idKey(byAnna))).toMatchObject({ version: 4, content: bank });
  });

  it("refuses what she writes after the role entry, even from a server that takes it", async () => {
    const { server, jonasDevice } = await saved();
    await resave(server, jonasDevice);
    const late = sealRecord(
      asAuthor(anna),
      after(anna).ring,
      byAnna,
      3,
      withField(bank, "password", "Anna-war-hier"),
      after(anna).lastSeen,
    );
    const lying = lyingServer(server, {
      pull: (records) => records.map((r) => (idKey(r.entryId) === idKey(byAnna) ? late : r)),
    });
    const pulled = await pull(emptyDevice(), lying, after(max));
    expect(pulled.refused).toEqual([{ entryId: byAnna, version: 3, error: "not-editor" }]);
  });

  it("a server cannot backdate her later version: the log state she saw is signed with it", async () => {
    const { server, jonasDevice } = await saved();
    await resave(server, jonasDevice);
    const late = sealRecord(
      asAuthor(anna),
      after(anna).ring,
      byAnna,
      3,
      bank,
      after(anna).lastSeen,
    );
    for (const backdated of [
      { ...late, lastSeen: contextFor(anna).lastSeen },
      { ...late, lastSeen: flipByte(late.lastSeen) },
    ]) {
      const lying = lyingServer(server, { pull: (records) => [...records, backdated] });
      expect((await pull(emptyDevice(), lying, after(jonas))).refused.map((r) => r.error)).toEqual([
        "bad-signature",
      ]);
    }
  });

  it("a server cannot get the manager's client to sign anew a version that does not count", async () => {
    const { server } = await saved();
    // No re-save happened; the server offers only Anna's versions, and a tampered one
    const first = (await server.pull()).find(
      (r) => idKey(r.entryId) === idKey(byAnna),
    ) as EntryRecord;
    const tampered = { ...first, author: jonas.id };
    const lying = lyingServer(server, { versions: (records) => [...records, tampered] });
    const restored = await restore(lying, emptyDevice());
    expect(restored.device.known.has(idKey(byAnna))).toBe(false);
    expect((await server.pull()).find((r) => idKey(r.entryId) === idKey(byAnna))?.version).toBe(1);
  });

  it("a server cannot replay her old version over the re-saved one (E-13)", async () => {
    const { server, jonasDevice } = await saved();
    const first = (await server.pull()).find(
      (r) => idKey(r.entryId) === idKey(byAnna),
    ) as EntryRecord;
    const device = await resave(server, jonasDevice);
    const replay = lyingServer(server, {
      pull: (records) => records.map((r) => (idKey(r.entryId) === idKey(byAnna) ? first : r)),
    });
    const pulled = await pull(device, replay, after(jonas));
    expect(pulled.refused).toEqual([{ entryId: byAnna, version: 1, error: "rollback" }]);
  });

  it("keeps the known version when it is the newest that counts, and restores nothing without one", async () => {
    const { server, jonasDevice } = await saved();
    const device = await resave(server, jonasDevice);
    const kept = restoreRefused(device, [server.versions(byAnna)], after(jonas));
    expect(kept.known.get(idKey(byAnna))).toBe(device.known.get(idKey(byAnna)));
    expect(kept.queue.map((op) => op.base?.version)).toEqual([2]);
    expect(restoreRefused(device, [[]], after(jonas))).toBe(device);
    expect(
      refusedByReaders([
        { entryId: byAnna, version: 3, error: "not-editor" },
        { entryId: byAnna, version: 4, error: "not-editor" },
        { entryId: byJonas, version: 2, error: "rollback" },
      ]),
    ).toEqual([byAnna]);
  });

  it("does not sign anew a version the device took while she could still edit", async () => {
    const { server, jonasDevice } = await saved();
    await resave(server, jonasDevice);
    const racing = withField(bank, "password", "Anna-war-schneller");
    server.push(
      sealRecord(
        asAuthor(anna),
        contextFor(anna).ring,
        byAnna,
        3,
        racing,
        contextFor(anna).lastSeen,
      ),
    );
    // Jonas's device pulls it before the role entry, when it still counts
    const took = (await pull(jonasDevice, server, contextFor(jonas))).device;
    expect(took.known.get(idKey(byAnna))?.content).toEqual(racing);
    const restored = await restore(server, took);
    expect(restored.device.known.get(idKey(byAnna))).toMatchObject({ version: 4, content: bank });
    const { device, refused } = await freshPull(server, max);
    expect(refused).toEqual([]);
    expect(device.known.get(idKey(byAnna))?.content).toEqual(bank);
  });
});
