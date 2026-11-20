import { digest, encode, openEntryKey, sign } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import type { EntryContent } from "./content.ts";
import { entryKeyFor, openRecord, openRecordWithKey, sealRecord } from "./record.ts";
import { anna, bank, contextFor, id, jonas, log, max, trust } from "./test/fixtures.ts";

const ctx = contextFor(jonas);
const entryId = id(0xe1);
const record = sealRecord(ctx.author, ctx.ring, entryId, 2, bank, ctx.lastSeen);
const open = (r = record, known = 0, ring = ctx.ring) => openRecord(r, ring, log, trust, known);

describe("openRecord (P-09)", () => {
  it("opens a record of an editor", () => {
    expect(open()).toEqual({ ok: true, value: bank });
  });

  it("refuses a record of another vault or another epoch", () => {
    expect(open(record, 0, { ...ctx.ring, vaultId: id(0xb1) })).toEqual({
      ok: false,
      error: "wrong-vault",
    });
    expect(open(record, 0, { ...ctx.ring, epoch: 1 })).toEqual({ ok: false, error: "wrong-vault" });
  });

  it("refuses the version it knows and an older one", () => {
    expect(open(record, 2)).toEqual({ ok: false, error: "stale" });
    expect(open(record, 3)).toEqual({ ok: false, error: "stale" });
    expect(open(record, 1).ok).toBe(true);
  });

  it("refuses an author without a certificate", () => {
    const stranger = { id: id(0x99), edSecretKey: new Uint8Array(32).fill(0x99) };
    expect(open(sealRecord(stranger, ctx.ring, entryId, 1, bank, ctx.lastSeen))).toEqual({
      ok: false,
      error: "uncertified-author",
    });
  });

  it("refuses an author who is certified but not a member, and a reader", () => {
    const outsiderTrust = { ...trust, certificates: new Map(trust.certificates) };
    const members = new Map(log.members);
    members.delete([...members.keys()][1] ?? "");
    const withoutAnna = { ...log, members };
    const byAnna = sealRecord(
      { id: anna.id, edSecretKey: anna.ed.secretKey },
      ctx.ring,
      entryId,
      1,
      bank,
      ctx.lastSeen,
    );
    expect(openRecord(byAnna, ctx.ring, withoutAnna, outsiderTrust, 0)).toEqual({
      ok: false,
      error: "not-editor",
    });
    const byMax = sealRecord(
      { id: max.id, edSecretKey: max.ed.secretKey },
      ctx.ring,
      entryId,
      1,
      bank,
      ctx.lastSeen,
    );
    expect(open(byMax)).toEqual({ ok: false, error: "not-editor" });
  });

  it("refuses a record it cannot read with the vault key, or whose content is not an entry", () => {
    expect(open(record, 0, { ...ctx.ring, vaultKey: new Uint8Array(32) })).toEqual({
      ok: false,
      error: "unreadable",
    });
    const other = sealRecord(ctx.author, ctx.ring, entryId, 3, bank, ctx.lastSeen);
    const mixed = { ...record, entryKey: other.entryKey };
    const signed = { ...mixed, signature: resign(mixed) };
    expect(open(signed)).toEqual({ ok: false, error: "unreadable" });
    const notAnEntry = sealRecord(
      ctx.author,
      ctx.ring,
      entryId,
      1,
      { title: 1 } as unknown as EntryContent,
      ctx.lastSeen,
    );
    expect(open(notAnEntry)).toEqual({ ok: false, error: "malformed" });
  });

  it("refuses a record whose content box belongs to another version", () => {
    const v3 = sealRecord(ctx.author, ctx.ring, entryId, 3, bank, ctx.lastSeen);
    const relabelled = { ...v3, version: 4 };
    expect(open({ ...relabelled, signature: resign(relabelled) })).toEqual({
      ok: false,
      error: "unreadable",
    });
  });
});

describe("the entry key across versions (P-09, P-10, P-11)", () => {
  const keyOf = (r: typeof record) => {
    const opened = openEntryKey(ctx.ring.vaultKey, r.entryKey, { ...ctx.ring, entryId: r.entryId });
    if (!opened.ok) throw new Error("unreadable");
    return opened.value;
  };

  it("opens a record with the entry key it was sealed with", () => {
    expect(openRecordWithKey(record, ctx.ring, log, trust, 0)).toEqual({
      ok: true,
      value: { content: bank, entryKey: keyOf(record) },
    });
    expect(openRecordWithKey(record, ctx.ring, log, trust, 2)).toEqual({
      ok: false,
      error: "stale",
    });
  });

  it("keeps an entry key of the same epoch for the next version", () => {
    const key = { entryKey: keyOf(record), epoch: 0 };
    const next = sealRecord(ctx.author, ctx.ring, entryId, 3, bank, ctx.lastSeen, key);
    expect(keyOf(next)).toEqual(key.entryKey);
    expect(entryKeyFor(ctx.ring, key)).toBe(key);
  });

  it("makes a new entry key without one, and in a new epoch", () => {
    const fresh = entryKeyFor(ctx.ring, undefined);
    expect([fresh.epoch, fresh.entryKey.length]).toEqual([0, 32]);
    expect(entryKeyFor(ctx.ring, undefined).entryKey).not.toEqual(fresh.entryKey);
    const old = { entryKey: keyOf(record), epoch: 1 };
    const renewed = entryKeyFor(ctx.ring, old);
    expect(renewed.epoch).toBe(0);
    expect(renewed.entryKey).not.toEqual(old.entryKey);
    const next = sealRecord(ctx.author, ctx.ring, entryId, 3, bank, ctx.lastSeen, old);
    expect(keyOf(next)).not.toEqual(old.entryKey);
    expect(keyOf(sealRecord(ctx.author, ctx.ring, entryId, 3, bank, ctx.lastSeen))).not.toEqual(
      keyOf(record),
    );
  });
});

// The author signs again, as a member who means harm could: the boxes must still be checked

function resign(r: typeof record) {
  return sign(
    jonas.ed.secretKey,
    "entry",
    r.vaultId,
    r.entryId,
    r.version,
    r.epoch,
    digest(encode(r.entryKey, r.content)),
    r.lastSeen,
  );
}
