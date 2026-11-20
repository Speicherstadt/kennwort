import { sign } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { certificateFingerprint } from "../membership/certificate.ts";
import { idKey } from "../membership/verify-log.ts";
import { entryKeyFor, sealRecord } from "./record.ts";
import {
  genuineShares,
  makeShare,
  openShared,
  reshare,
  type Share,
  SharesWire,
  shareToWire,
} from "./share.ts";
import {
  anna,
  bank,
  certificate,
  contextFor,
  id,
  jonas,
  log,
  max,
  type Person,
  sandra,
  trust,
} from "./test/fixtures.ts";

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

  it("refuses a version older than the highest the reader has seen (E-13)", () => {
    const later = sealRecord(ctx.author, ctx.ring, entryId, 2, bank, ctx.lastSeen, key);
    const openAt = (r: typeof record, seen: number) => openShared(share, r, asSandra, trust, seen);
    expect(openAt(record, 2)).toEqual(refused("rollback"));
    expect(openAt(record, 1)).toEqual({ ok: true, value: bank });
    expect(openAt(later, 2)).toEqual({ ok: true, value: bank });
    expect(open(share, { ...later, version: 3 })).toEqual(refused("bad-signature"));
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

describe("genuineShares (P-10)", () => {
  const by = (p: Person, to = sandra, entryKey = key.entryKey, at = place) =>
    makeShare({ id: p.id, edSecretKey: p.ed.secretKey }, entryKey, certificate(to), at, {
      validUntil: 0,
      time,
    });
  const genuine = (shares: Share[], l = log, t = trust) =>
    genuineShares(shares, key.entryKey, place, l, t);
  const withAnna = (change: object) => {
    const members = new Map(log.members);
    const member = members.get(idKey(anna.id));
    if (member) members.set(idKey(anna.id), { ...member, ...change });
    return { ...log, members };
  };

  it("keeps shares that editors and managers of the vault signed over the entry key", () => {
    const shares = [by(jonas), by(anna, max)];
    expect(genuine(shares)).toEqual(shares);
  });

  it("drops shares by readers, outsiders and members whose time ran out", () => {
    expect(genuine([by(max), by(sandra, anna)])).toEqual([]);
    const byAnna = by(anna);
    expect(genuine([byAnna], withAnna({ validUntil: trust.now }))).toEqual([]);
    expect(genuine([byAnna], withAnna({ validUntil: trust.now + 1 }))).toEqual([byAnna]);
  });

  it("drops a sharer whose certificate is not the one the log names, or has none", () => {
    expect(genuine([by(anna)], withAnna({ fingerprint: new Uint8Array(32) }))).toEqual([]);
    const without = { ...trust, certificates: new Map(trust.certificates) };
    without.certificates.delete(idKey(anna.id));
    expect(genuine([by(anna)], log, without)).toEqual([]);
  });

  it("drops shares of another entry or vault, under another key, or with a changed signature", () => {
    const otherKey = entryKeyFor(ctx.ring, undefined).entryKey;
    expect(genuine([by(jonas, sandra, otherKey)])).toEqual([]);
    expect(genuine([by(jonas, sandra, key.entryKey, { ...place, entryId: id(0xe2) })])).toEqual([]);
    expect(genuine([by(jonas, sandra, key.entryKey, { ...place, vaultId: id(0xb1) })])).toEqual([]);
    expect(genuine([{ ...by(jonas), time: time + 1 }])).toEqual([]);
  });

  it("drops a share that names another entry or vault, even signed with this entry's binding", () => {
    const naming = (at: typeof place) =>
      resigned({ ...by(jonas, sandra, key.entryKey, at), commitment: share.commitment });
    expect(genuine([naming({ ...place, entryId: id(0xe2) })])).toEqual([]);
    expect(genuine([naming({ ...place, vaultId: id(0xb1) })])).toEqual([]);
    expect(genuine([naming(place)])).toHaveLength(1);
  });
});

describe("reshare (revoking, P-10)", () => {
  const renewed = entryKeyFor(ctx.ring, undefined);
  const later = sealRecord(ctx.author, ctx.ring, entryId, 2, bank, ctx.lastSeen, renewed);
  const again = (shares: Share[]) => reshare(ctx.author, renewed.entryKey, shares, trust, time + 9);

  it("makes the shares again under the new key, to the same recipients and expiry", () => {
    const [toSandra, toMax] = again([shareTo(sandra, trust.now + 50), shareTo(max)]);
    expect(open(toSandra, later)).toEqual({ ok: true, value: bank });
    expect(open(toSandra, record)).toEqual(refused("unreadable"));
    expect(openShared(toMax as Share, later, readerOf(max), trust)).toEqual({
      ok: true,
      value: bank,
    });
    expect([toSandra?.validUntil, toSandra?.time, toSandra?.sharer]).toEqual([
      trust.now + 50,
      time + 9,
      jonas.id,
    ]);
    expect(toMax?.validUntil).toBe(0);
  });

  it("leaves out shares that ran out and recipients without a certificate", () => {
    const stranger = { ...sandra, id: id(0x99) };
    const toStranger = makeShare(ctx.author, key.entryKey, certificate(stranger), place, {
      validUntil: 0,
      time,
    });
    expect(again([shareTo(sandra, trust.now), toStranger])).toEqual([]);
    expect(again([shareTo(sandra, trust.now + 1)])).toHaveLength(1);
  });
});
