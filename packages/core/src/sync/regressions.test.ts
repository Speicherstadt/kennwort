import { digest, encode, newEntryKey, sealEntry, sealEntryKey, sign } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { bytes } from "./bytes.ts";
import { mergeContent } from "./content.ts";
import { edit, emptyDevice, pull, sync } from "./device.ts";
import { memoryServer } from "./memory-server.ts";
import { type EntryRecord, openRecord, sealRecord } from "./record.ts";
import { anna, bank, contextFor, id, jonas, max, withField } from "./test/fixtures.ts";

const entryId = id(0xe1);

describe("sync regressions found in the review of K-109", () => {
  it("R1 openRecord returns an error value for a signed record whose plaintext is not JSON", () => {
    const ctx = contextFor(anna);
    const at = { vaultId: ctx.ring.vaultId, entryId, epoch: 0 };
    const ek = newEntryKey();
    const unsigned = {
      vaultId: ctx.ring.vaultId,
      entryId,
      version: 1,
      epoch: 0,
      entryKey: sealEntryKey(ctx.ring.vaultKey, ek, at),
      content: sealEntry(ek, new TextEncoder().encode("not json"), at, 1),
      author: anna.id,
      lastSeen: ctx.lastSeen,
    };
    const signature = sign(
      anna.ed.secretKey,
      "entry",
      unsigned.vaultId,
      unsigned.entryId,
      1,
      0,
      digest(encode(unsigned.entryKey, unsigned.content)),
      unsigned.lastSeen,
    );
    const record: EntryRecord = { ...unsigned, signature };
    const j = contextFor(jonas);
    expect(openRecord(record, j.ring, j.log, j.trust, 0)).toEqual({
      ok: false,
      error: "not-json",
    });
  });

  it("R2 a field renamed differently on both sides keeps both names somewhere", () => {
    const rename = (name: string) => ({
      ...bank,
      fields: bank.fields.map((f) => (f.id === "password" ? { ...f, name } : f)),
    });
    const merged = mergeContent(bank, rename("PIN"), rename("Kennwort"), 1);
    expect(JSON.stringify(merged)).toContain("PIN");
  });

  it("R3 a type changed differently on both sides is not silently dropped", () => {
    const merged = mergeContent(bank, { ...bank, type: "card" }, { ...bank, type: "wifi" }, 1);
    expect(JSON.stringify(merged)).toContain("card");
  });

  it("R4 a known entry that vanishes from the server is reported (E-15)", () => {
    const server = memoryServer();
    const device = sync(edit(emptyDevice(), entryId, bank), server, contextFor(jonas)).device;
    const hiding = { push: server.push, pull: () => [] };
    const { refused } = pull(device, hiding, contextFor(jonas));
    expect(refused).toEqual([{ entryId, version: 1, error: "missing" }]);
  });

  it("R5 a refusal from the first pull survives a retry pull during push", () => {
    const real = memoryServer();
    const ctx = contextFor(jonas);
    const bad = sealRecord(
      { id: max.id, edSecretKey: max.ed.secretKey },
      ctx.ring,
      id(0xe2),
      1,
      bank,
      new Uint8Array(),
    );
    let device = sync(edit(emptyDevice(), entryId, bank), real, ctx).device;
    real.push(sealRecord(ctx.author, ctx.ring, entryId, 2, { ...bank, title: "x" }, ctx.lastSeen));
    let first = true;
    let calls = 0;
    const server = {
      push: (r: EntryRecord) =>
        calls++ === 0 ? { ok: false as const, current: undefined } : real.push(r),
      pull: () => {
        const all = real.pull();
        if (first) {
          first = false;
          return [bad, ...all];
        }
        return all;
      },
    };
    device = edit(device, entryId, { ...bank, favorite: true });
    const out = sync(device, server, ctx);
    expect(out.refused.map((r) => r.error)).toContain("not-editor");
  });

  it("R6 bytes() refuses non-canonical base64url", () => {
    expect(bytes(1).safeParse("AA").success).toBe(true);
    expect(bytes(1).safeParse("AB").error?.issues[0]).toMatchObject({
      code: "custom",
      message: "not canonical base64url",
    });
  });

  it("keeps a refusal that only a retry pull showed, and reports a repeated one once", () => {
    const real = memoryServer();
    const ctx = contextFor(jonas);
    const bad = sealRecord(
      { id: max.id, edSecretKey: max.ed.secretKey },
      ctx.ring,
      id(0xe2),
      1,
      bank,
      new Uint8Array(),
    );
    let device = sync(edit(emptyDevice(), entryId, bank), real, ctx).device;
    real.push(sealRecord(ctx.author, ctx.ring, entryId, 2, { ...bank, title: "x" }, ctx.lastSeen));
    let pulls = 0;
    let pushes = 0;
    const lateBad = {
      push: (r: EntryRecord) =>
        pushes++ === 0 ? { ok: false as const, current: undefined } : real.push(r),
      pull: () => (pulls++ === 0 ? real.pull() : [bad, ...real.pull()]),
    };
    device = edit(device, entryId, { ...bank, favorite: true });
    expect(sync(device, lateBad, ctx).refused.map((r) => r.error)).toEqual(["not-editor"]);
    const alwaysBad = { push: real.push, pull: () => [bad, ...real.pull()] };
    const failing = { ...alwaysBad, push: () => ({ ok: false as const, current: undefined }) };
    const twice = sync(edit(device, entryId, { ...bank, favorite: false }), failing, ctx);
    expect(twice.refused.map((r) => r.error)).toEqual(["not-editor"]);
  });

  it("reports two different refusals of one sync both", () => {
    const real = memoryServer();
    const ctx = contextFor(jonas);
    const byMax = (entry: number) =>
      sealRecord(
        { id: max.id, edSecretKey: max.ed.secretKey },
        ctx.ring,
        id(entry),
        1,
        bank,
        new Uint8Array(),
      );
    const server = { push: real.push, pull: () => [byMax(0xe3), byMax(0xe4), ...real.pull()] };
    const result = sync(edit(emptyDevice(), entryId, bank), server, ctx);
    expect(result.refused.map((r) => r.entryId[0])).toEqual([0xe3, 0xe4]);
  });

  it("reports a server that replays an older version of a known entry (E-13/E-15)", () => {
    const server = memoryServer();
    const ctx = contextFor(jonas);
    const v1 = sealRecord(ctx.author, ctx.ring, entryId, 1, bank, ctx.lastSeen);
    server.push(v1);
    let device = pull(emptyDevice(), server, ctx).device;
    device = sync(edit(device, entryId, withField(bank, "password", "new")), server, ctx).device;
    const rollingBack = { push: server.push, pull: () => [v1] };
    expect(pull(device, rollingBack, ctx).refused).toEqual([
      { entryId, version: 1, error: "rollback" },
    ]);
    expect(pull(device, server, ctx).refused).toEqual([]);
  });
});
