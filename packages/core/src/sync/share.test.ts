import { sign } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { certificateFingerprint } from "../membership/certificate.ts";
import { entryKeyFor, sealRecord } from "./record.ts";
import { makeShare, openShared, type Share, SharesWire, shareToWire } from "./share.ts";
import { bank, certificate, contextFor, id, jonas, max, sandra, trust } from "./test/fixtures.ts";

const ctx = contextFor(jonas);
const entryId = id(0xe1);
const key = entryKeyFor(ctx.ring, undefined);
const record = sealRecord(ctx.author, ctx.ring, entryId, 1, bank, ctx.lastSeen, key);
const place = { vaultId: ctx.ring.vaultId, entryId };
const time = 1_800_000_050;
const shareTo = (p = sandra, validUntil = 0, entryKey = key.entryKey) =>
  makeShare(ctx.author, entryKey, certificate(p), place, { validUntil, time });
const share = shareTo();
const readerOf = (p: typeof sandra) => ({
  accountId: p.id,
  secretKey: p.xwing.secretKey,
  fingerprint: certificateFingerprint(certificate(p)),
});
const asSandra = readerOf(sandra);
const open = (s: Share = share, r = record, me = asSandra) => openShared(s, r, me, trust);
const refused = (error: string) => ({ ok: false, error });

/** Signed again by Jonas, as a sharer who means harm could: the key must still be checked */
const resigned = (s: Share): Share => {
  const { signature: _, ...rest } = s;
  const fields = [s.vaultId, s.entryId, s.recipient, s.role, s.validUntil, s.commitment] as const;
  const more = [s.wrappedKey, s.sharer, s.time] as const;
  return { ...rest, signature: sign(jonas.ed.secretKey, "share", ...fields, ...more) };
};

describe("openShared (P-10)", () => {
  it("lets the recipient read the shared entry, in this and every later version", () => {
    expect(open()).toEqual({ ok: true, value: bank });
    const later = sealRecord(ctx.author, ctx.ring, entryId, 2, bank, ctx.lastSeen, key);
    expect(open(share, later)).toEqual({ ok: true, value: bank });
  });

  it("is for its recipient only", () => {
    expect(open(share, record, readerOf(max))).toEqual(refused("not-for-me"));
    expect(open(shareTo(max))).toEqual(refused("not-for-me"));
  });

  it("ends at its expiry, by the reader's clock", () => {
    expect(open(shareTo(sandra, trust.now))).toEqual(refused("expired"));
    expect(open(shareTo(sandra, trust.now - 1))).toEqual(refused("expired"));
    expect(open(shareTo(sandra, trust.now + 1))).toEqual({ ok: true, value: bank });
  });

  it("refuses a sharer without a certificate and a changed or foreign signature", () => {
    const stranger = { id: id(0x99), edSecretKey: new Uint8Array(32).fill(0x99) };
    const byStranger = makeShare(stranger, key.entryKey, certificate(sandra), place, {
      validUntil: 0,
      time,
    });
    expect(open(byStranger)).toEqual(refused("uncertified-sharer"));
    expect(open({ ...share, validUntil: trust.now + 10 })).toEqual(refused("bad-signature"));
    expect(open({ ...share, sharer: max.id })).toEqual(refused("bad-signature"));
  });

  it("refuses a key that does not match the signed binding, or is wrapped to someone else", () => {
    const other = shareTo(sandra, 0, entryKeyFor(ctx.ring, undefined).entryKey);
    expect(open(resigned({ ...share, commitment: other.commitment }))).toEqual(
      refused("not-committed"),
    );
    const toMax = shareTo(max);
    expect(open(resigned({ ...share, wrappedKey: toMax.wrappedKey }))).toEqual(
      refused("not-authentic"),
    );
  });

  it("reads no other entry, not even one of the same vault", () => {
    const other = sealRecord(ctx.author, ctx.ring, id(0xe2), 1, bank, ctx.lastSeen, key);
    expect(open(share, other)).toEqual(refused("wrong-entry"));
    const elsewhere = { ...ctx.ring, vaultId: id(0xb1) };
    const otherVault = sealRecord(ctx.author, elsewhere, entryId, 1, bank, ctx.lastSeen, key);
    expect(open(share, otherVault)).toEqual(refused("wrong-entry"));
  });

  it("cannot read the entry once it is sealed under a new entry key (revoking, P-10)", () => {
    const renewed = sealRecord(ctx.author, ctx.ring, entryId, 2, bank, ctx.lastSeen);
    expect(open(share, renewed)).toEqual(refused("unreadable"));
  });

  it("refuses a record without a certified author's valid signature", () => {
    const stranger = { id: id(0x99), edSecretKey: new Uint8Array(32).fill(0x99) };
    const byStranger = sealRecord(stranger, ctx.ring, entryId, 1, bank, ctx.lastSeen, key);
    expect(open(share, byStranger)).toEqual(refused("uncertified-author"));
    expect(open(share, { ...record, version: 2 })).toEqual(refused("bad-signature"));
  });
});

describe("Share on the wire", () => {
  it("reads back what it wrote, alone and as a list", () => {
    const wire = JSON.parse(JSON.stringify(shareToWire(share)));
    expect(SharesWire.parse({ shares: [wire] })).toEqual({ shares: [share] });
    expect(SharesWire.safeParse({ shares: [{ ...wire, role: "edit" }] }).success).toBe(false);
  });
});
