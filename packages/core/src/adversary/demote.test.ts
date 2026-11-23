/**
 * Demoting an editor to reading (P-09, P-06): what Anna saved while she could edit stays valid for
 * everyone, because each version names the log state it was written at (signed "last seen"), and
 * she was an editor there. What she writes after the demotion is refused, and a server can neither
 * move a version to an earlier log state nor bring back an older version (E-05, E-13).
 */
import { describe, expect, it } from "vitest";
import { entryHash, type LogEntry } from "../membership/log-entry.ts";
import { addMember, changeAccess, removeMember } from "../membership/vault-ops.ts";
import { idKey, verifyLog } from "../membership/verify-log.ts";
import { edit, emptyDevice, pull, sync } from "../sync/device.ts";
import { memoryServer } from "../sync/memory-server.ts";
import { type EntryRecord, openRecord, sealRecord } from "../sync/record.ts";
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
  trust,
  vaultId,
  withField,
} from "../sync/test/fixtures.ts";
import { flipByte, lyingServer } from "./lying-server.ts";

const entryId = id(0xe1);
const signer = { accountId: jonas.id, edSecretKey: jonas.ed.secretKey };
const asAuthor = (p: Person) => ({ id: p.id, edSecretKey: p.ed.secretKey });

/** Jonas reduces Anna to reading, after she saved the bank login */
const demoted = async (change: "role" | "remove" = "role") => {
  const server = memoryServer();
  await sync(edit(emptyDevice(), entryId, bank), server, contextFor(anna));
  const entry =
    change === "role"
      ? changeAccess(signer, log, vaultId, anna.id, { role: "read", validUntil: 0 }, 1_800_000_010)
      : removeMember(signer, log, vaultId, anna.id, 1_800_000_010);
  const entries: LogEntry[] = [...logEntries, entry];
  const checked = verifyLog(vaultId, entries, trust);
  if (!checked.ok) throw new Error(checked.error);
  const ctx = (p: Person) => ({
    ...contextFor(p),
    log: checked.value,
    lastSeen: entryHash(entry),
  });
  return { server, ctx, before: contextFor(anna).lastSeen, after: entryHash(entry) };
};

describe("an editor demoted to reading", () => {
  it("keeps the versions she saved while she could edit valid for everyone", async () => {
    const { server, ctx } = await demoted();
    for (const p of [jonas, anna, max]) {
      const { device, refused } = await pull(emptyDevice(), server, ctx(p));
      expect(refused).toEqual([]);
      expect(device.known.size).toBe(1);
    }
  });

  it("cannot write a new version: her client names the log state after the demotion", async () => {
    const { server, ctx, after } = await demoted();
    const late = sealRecord(
      asAuthor(anna),
      ctx(anna).ring,
      entryId,
      2,
      withField(bank, "password", "Anna-war-hier"),
      after,
    );
    // The server takes the push although she only reads, and serves it
    const lying = lyingServer(server, { pull: (records) => [...records, late] });
    const pulled = await pull(emptyDevice(), lying, ctx(jonas));
    expect(pulled.refused).toEqual([{ entryId, version: 2, error: "not-editor" }]);
    expect(pulled.device.known.get([...pulled.device.known.keys()][0] ?? "")?.version).toBe(1);
  });

  it("is refused at a log state the checked log does not contain", async () => {
    const { server, ctx } = await demoted();
    const elsewhere = sealRecord(asAuthor(anna), ctx(anna).ring, entryId, 2, bank, id(0x99));
    const lying = lyingServer(server, { pull: (records) => [...records, elsewhere] });
    const pulled = await pull(emptyDevice(), lying, ctx(max));
    expect(pulled.refused.map((r) => r.error)).toEqual(["not-editor"]);
  });

  it("a server cannot backdate her later version to before the demotion: the signature binds it", async () => {
    const { server, ctx, before, after } = await demoted();
    const late = sealRecord(asAuthor(anna), ctx(anna).ring, entryId, 2, bank, after);
    const backdated: EntryRecord = { ...late, lastSeen: before };
    const lying = lyingServer(server, { pull: (records) => [...records, backdated] });
    const pulled = await pull(emptyDevice(), lying, ctx(jonas));
    expect(pulled.refused.map((r) => r.error)).toEqual(["bad-signature"]);
    const flipped: EntryRecord = { ...late, lastSeen: flipByte(after) };
    const twice = lyingServer(server, { pull: (records) => [...records, flipped] });
    expect((await pull(emptyDevice(), twice, ctx(jonas))).refused.map((r) => r.error)).toEqual([
      "bad-signature",
    ]);
  });

  it("a server cannot replay her old version over a newer one (E-13)", async () => {
    const { server, ctx } = await demoted();
    const first = (await server.pull())[0] as EntryRecord;
    const known = (await pull(emptyDevice(), server, ctx(jonas))).device;
    const changed = await sync(
      edit(known, entryId, withField(bank, "password", "Jonas-2026")),
      server,
      ctx(jonas),
    );
    const replay = lyingServer(server, { pull: () => [first] });
    const pulled = await pull(changed.device, replay, ctx(jonas));
    expect(pulled.refused).toEqual([{ entryId, version: 1, error: "rollback" }]);
  });

  it("a removed member's versions still count no more until the rotation rewrites them (P-11)", async () => {
    const { server, ctx } = await demoted("remove");
    const pulled = await pull(emptyDevice(), server, ctx(jonas));
    expect(pulled.refused).toEqual([{ entryId, version: 1, error: "not-editor" }]);
  });

  it("removed and added again as a reader, her earlier versions still count no more (P-11)", async () => {
    const { server, ctx } = await demoted("remove");
    const removed = ctx(jonas).log;
    const back = addMember(
      signer,
      removed,
      ctx(jonas).ring,
      certificate(anna),
      { role: "read", validUntil: 0 },
      1_800_000_011,
    ).entry;
    const entries = [
      ...logEntries,
      removeMember(signer, log, vaultId, anna.id, 1_800_000_010),
      back,
    ];
    const checked = verifyLog(vaultId, entries, trust);
    if (!checked.ok) throw new Error(checked.error);
    expect(checked.value.members.get(idKey(anna.id))?.role).toBe("read");
    const pulled = await pull(emptyDevice(), server, { ...ctx(jonas), log: checked.value });
    expect(pulled.refused).toEqual([{ entryId, version: 1, error: "not-editor" }]);
  });

  it("counts the log state only in the record's own epoch", async () => {
    const { server, ctx, before } = await demoted();
    const record = (await server.pull())[0] as EntryRecord;
    const { log: demotedLog, ring, trust: t } = ctx(jonas);
    const editors = new Set([idKey(anna.id)]);
    const otherEpoch = {
      ...demotedLog,
      editorsAt: new Map([[idKey(before), { epoch: 1, editors }]]),
    };
    expect(openRecord(record, ring, otherEpoch, t, 0)).toEqual({ ok: false, error: "not-editor" });
    const sameEpoch = {
      ...demotedLog,
      editorsAt: new Map([[idKey(before), { epoch: 0, editors }]]),
    };
    expect(openRecord(record, ring, sameEpoch, t, 0).ok).toBe(true);
    const { editorsAt: _, ...handMade } = demotedLog;
    expect(openRecord(record, ring, handMade, t, 0)).toEqual({ ok: false, error: "not-editor" });
  });
});
