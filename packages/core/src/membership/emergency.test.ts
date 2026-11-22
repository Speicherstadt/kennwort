import { emergencyGrantMessage, sign } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import {
  certificate,
  DAY,
  fullGrant,
  GRANTED_AT,
  grantTo,
  jonas,
  jonasAuthor,
  ring,
  sandra,
  trust,
} from "../sync/test/emergency.ts";
import { anna, id, max, person, root } from "../sync/test/fixtures.ts";
import { toWire } from "../sync/wire.ts";
import { certify } from "./certificate.ts";
import {
  checkGrant,
  isBehind,
  isSignedGrant,
  isSignedStatement,
  makeGrant,
  signStatement,
} from "./emergency.ts";
import {
  EmergencyGrant,
  EmergencyPackages,
  GrantUpload,
  grantToWire,
  packagesToWire,
  Statement,
  statementToWire,
} from "./emergency-wire.ts";
import { idKey } from "./verify-log.ts";

const { grant, packages } = grantTo();
const me = certificate(sandra);
const refused = (error: string) => ({ ok: false, error });
const roundTrip = <T>(schema: { parse: (v: unknown) => T }, wire: unknown) =>
  schema.parse(JSON.parse(JSON.stringify(wire)));

describe("making a grant (P-14, F-09)", () => {
  it("names grantor, grantee, its bundle, scope, waiting time and each vault key's commitment", () => {
    expect(grant).toMatchObject({
      companyId: me.companyId,
      grantor: jonas.id,
      grantee: sandra.id,
      scope: "view",
      waitSeconds: 7 * DAY,
      time: GRANTED_AT,
    });
    expect(grant.accountCommitment).toBeUndefined();
    expect(grant.items.map((i) => [idKey(i.vaultId), i.epoch])).toEqual([[idKey(ring.vaultId), 0]]);
    expect(packages.vaults.map((p) => [idKey(p.vaultId), p.epoch])).toEqual([
      [idKey(ring.vaultId), 0],
    ]);
    expect(packages.account).toBeUndefined();
    expect(isSignedGrant(jonas.ed.publicKey, grant)).toBe(true);
    expect(isSignedGrant(sandra.ed.publicKey, grant)).toBe(false);
  });

  it("for full access carries the commitment to AK and its package, and no vault", () => {
    const full = fullGrant();
    expect(full.grant.scope).toBe("full");
    expect(full.grant.accountCommitment).toHaveLength(32);
    expect(full.grant.items).toEqual([]);
    expect(full.packages).toEqual({ vaults: [], account: expect.any(Uint8Array) });
    expect(isSignedGrant(jonas.ed.publicKey, full.grant)).toBe(true);
  });

  it("waits one to 30 days", () => {
    for (const waitSeconds of [DAY, 30 * DAY])
      expect(grantTo(sandra, undefined, { waitSeconds }).grant.waitSeconds).toBe(waitSeconds);
    for (const waitSeconds of [DAY - 1, 30 * DAY + 1])
      expect(() => grantTo(sandra, undefined, { waitSeconds })).toThrow(
        "waiting time out of range",
      );
  });

  it("goes over the wire and back unchanged, and nothing malformed passes", () => {
    const upload = { grant: grantToWire(grant), packages: packagesToWire(packages) };
    expect(roundTrip(GrantUpload, upload)).toEqual({ grant, packages });
    const full = fullGrant();
    expect(roundTrip(EmergencyGrant, grantToWire(full.grant))).toEqual(full.grant);
    expect(roundTrip(EmergencyPackages, packagesToWire(full.packages))).toEqual(full.packages);
    const wire = grantToWire(grant);
    const twice = { ...wire, items: [...wire.items, ...wire.items] };
    const fullWire = grantToWire(full.grant);
    const two = grantTo(sandra, { scope: "view", rings: [ring, { ...ring, vaultId: id(0xb1) }] });
    expect(roundTrip(EmergencyGrant, grantToWire(two.grant))).toEqual(two.grant);
    for (const bad of [
      twice,
      { ...wire, items: [] },
      { ...wire, accountCommitment: toWire(full.grant).accountCommitment },
      { ...fullWire, items: wire.items },
      { ...fullWire, accountCommitment: undefined },
      { ...wire, scope: "takeover" },
      { ...wire, waitSeconds: DAY - 1 },
      { ...wire, waitSeconds: 30 * DAY + 1 },
    ])
      expect(EmergencyGrant.safeParse(bad).success).toBe(false);
  });
});

describe("checking a grant (P-14)", () => {
  it("gives the grantor's certificate for a genuine grant to this account", () => {
    expect(checkGrant(grant, me, trust, undefined)).toEqual({
      ok: true,
      value: certificate(jonas),
    });
  });

  it("is for its grantee only, and for the bundle it has (a swapped grantee key)", () => {
    expect(checkGrant(grant, certificate(anna), trust, undefined)).toEqual(refused("not-for-me"));
    const swapped = { ...me, xwingPublicKey: certificate(max).xwingPublicKey };
    expect(checkGrant(grant, swapped, trust, undefined)).toEqual(refused("not-for-me"));
  });

  it("refuses a grantor the pinned root did not certify, or of another company", () => {
    const stranger = person(0x99);
    const byStranger = makeGrant(
      { id: stranger.id, edSecretKey: stranger.ed.secretKey },
      me,
      { scope: "view", rings: [ring] },
      { waitSeconds: DAY, time: GRANTED_AT },
    );
    expect(checkGrant(byStranger.grant, me, trust, undefined)).toEqual(
      refused("uncertified-grantor"),
    );
    const elsewhere = { ...grant, companyId: id(0xc1) };
    expect(checkGrant(elsewhere, me, trust, undefined)).toEqual(refused("uncertified-grantor"));
    const otherCompany = certify(root.secretKey, { ...certificate(jonas), companyId: id(0xc1) });
    const moved = { ...trust, certificates: new Map(trust.certificates) };
    moved.certificates.set(idKey(jonas.id), otherCompany);
    expect(checkGrant(grant, me, moved, undefined)).toEqual(refused("uncertified-grantor"));
  });

  it("refuses any change to what the grantor signed (a forged binding)", () => {
    const flipped = new Uint8Array(grant.items[0]?.commitment ?? []);
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    for (const changed of [
      { ...grant, waitSeconds: DAY },
      { ...grant, time: GRANTED_AT + 1 },
      { ...grant, items: [{ ...ring, commitment: flipped }] },
      { ...grant, signature: new Uint8Array(65) },
    ])
      expect(checkGrant(changed, me, trust, undefined)).toEqual(refused("bad-signature"));
  });

  it("refuses a grant older than the newest seen, and that one after its revocation (replay)", () => {
    const seen = { grant: GRANTED_AT, revoked: false, objected: 0 };
    expect(checkGrant(grant, me, trust, seen).ok).toBe(true);
    expect(checkGrant(grant, me, trust, { ...seen, revoked: true })).toEqual(refused("replayed"));
    expect(checkGrant(grant, me, trust, { ...seen, grant: GRANTED_AT + 1 })).toEqual(
      refused("replayed"),
    );
  });
});

describe("statements around a grant (F-09)", () => {
  const request = signStatement("emergency-request", sandra.ed.secretKey, grant, GRANTED_AT + 60);

  it("are signed for the grant's two accounts and a time", () => {
    expect(request).toMatchObject({ grantor: jonas.id, grantee: sandra.id, at: GRANTED_AT + 60 });
    expect(roundTrip(Statement, statementToWire(request))).toEqual(request);
    expect(isSignedStatement("emergency-request", sandra.ed.publicKey, grant, request)).toBe(true);
  });

  it("count only for their own kind, signer, accounts, company and time", () => {
    const check = (
      changes: object,
      kind = "emergency-request" as const,
      key = sandra.ed.publicKey,
    ) => isSignedStatement(kind, key, { ...grant, ...changes }, request);
    expect(isSignedStatement("emergency-approval", sandra.ed.publicKey, grant, request)).toBe(
      false,
    );
    expect(check({}, "emergency-request", jonas.ed.publicKey)).toBe(false);
    expect(check({ grantor: anna.id })).toBe(false);
    expect(check({ grantee: anna.id })).toBe(false);
    expect(check({ companyId: id(0xc1) })).toBe(false);
    const later = { ...request, at: request.at + 1 };
    expect(isSignedStatement("emergency-request", sandra.ed.publicKey, grant, later)).toBe(false);
  });

  it("carry the right accounts even when the signature fits other ones", () => {
    // Sandra signs a request naming Anna as grantee: it is no request for this grant
    const forAnna = { ...grant, grantee: anna.id };
    const signed = signStatement("emergency-request", sandra.ed.secretKey, forAnna, 5);
    expect(isSignedStatement("emergency-request", sandra.ed.publicKey, forAnna, signed)).toBe(true);
    expect(isSignedStatement("emergency-request", sandra.ed.publicKey, grant, signed)).toBe(false);
    expect(
      isSignedStatement("emergency-request", sandra.ed.publicKey, grant, {
        ...request,
        grantor: anna.id,
      }),
    ).toBe(false);
    expect(
      isSignedStatement("emergency-request", sandra.ed.publicKey, grant, {
        ...request,
        grantee: anna.id,
      }),
    ).toBe(false);
    const relabelled = { ...signed, grantee: sandra.id };
    expect(isSignedStatement("emergency-request", sandra.ed.publicKey, grant, relabelled)).toBe(
      false,
    );
  });
});

describe("renewing after a key rotation (P-11)", () => {
  it("is due when the grantor holds a newer key of a vault in the grant", () => {
    expect(isBehind(grant, [ring])).toBe(false);
    expect(isBehind(grant, [{ ...ring, epoch: 1 }])).toBe(true);
    expect(isBehind(grant, [{ ...ring, vaultId: id(0xb1), epoch: 1 }])).toBe(false);
    expect(isBehind(grant, [])).toBe(false);
    const second = { ...ring, vaultId: id(0xb1) };
    const both = grantTo(sandra, { scope: "view", rings: [ring, second] }).grant;
    expect(isBehind(both, [ring, { ...second, epoch: 2 }])).toBe(true);
  });
});

describe("the signed grant message", () => {
  it("is what makeGrant signs", () => {
    const { signature: _, ...rest } = grant;
    const message = emergencyGrantMessage({
      companyId: rest.companyId,
      grantorId: rest.grantor,
      granteeId: rest.grantee,
      granteeFingerprint: rest.granteeFingerprint,
      scope: rest.scope,
      waitSeconds: rest.waitSeconds,
      time: rest.time,
      accountCommitment: new Uint8Array(),
      items: rest.items,
    });
    expect(sign(jonasAuthor.edSecretKey, "emergency", message)).toEqual(grant.signature);
  });
});
