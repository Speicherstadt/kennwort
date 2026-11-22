/**
 * The attacks on emergency access (P-14, K-307 part d): a lying server lets the packages out
 * before the waiting time, after the grantor objected, swaps the grantee's key, forges a binding,
 * hands out a key no log binds, or plays an old grant back after the grantor revoked it (E-04,
 * E-05, E-16 of the catalog after the ETH study). Each test names its attack; the grantee's client
 * must notice it with what it checks and remembers itself.
 */
import { ed25519KeyPair, wrapEmergencyVaultKey } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { noteObjection, noteRevocation } from "../account/emergency-seen.ts";
import { certificateFingerprint, certify } from "../membership/certificate.ts";
import { checkGrant, signStatement } from "../membership/emergency.ts";
import { checkRelease, openEmergencyVault } from "../membership/emergency-open.ts";
import { certificateOf, idKey, type Trust } from "../membership/verify-log.ts";
import {
  certificate,
  DAY,
  GRANTED_AT,
  grantTo,
  jonas,
  parties,
  requestBy,
  ring,
  sandra,
  sandraReader,
  trust,
} from "../sync/test/emergency.ts";
import { certificate as certOf, log, max } from "../sync/test/fixtures.ts";
import { flipByte } from "./lying-server.ts";

const { grant, packages } = grantTo();
const me = certificate(sandra);
const REQUESTED = GRANTED_AT + 100;
const request = requestBy(sandra, grant, REQUESTED);

describe("attacks on emergency access (P-14)", () => {
  it("early release: packages before the waiting time are not used", () => {
    const released = { request, approval: null };
    expect(checkRelease(grant, released, parties, undefined, REQUESTED + DAY)).toEqual({
      ok: false,
      error: "waiting",
    });
    // The server backdates the request: it cannot sign one in Sandra's name
    const backdated = { ...request, at: REQUESTED - 7 * DAY };
    expect(
      checkRelease(
        grant,
        { request: backdated, approval: null },
        parties,
        undefined,
        REQUESTED + DAY,
      ),
    ).toEqual({
      ok: false,
      error: "not-my-request",
    });
    // Nor an early approval in Jonas's name
    const forgedApproval = signStatement(
      "emergency-approval",
      sandra.ed.secretKey,
      grant,
      REQUESTED,
    );
    expect(
      checkRelease(grant, { request, approval: forgedApproval }, parties, undefined, REQUESTED),
    ).toEqual({ ok: false, error: "waiting" });
  });

  it("release after an objection: the request Jonas objected to stays blocked", () => {
    const objection = signStatement("emergency-objection", jonas.ed.secretKey, grant, REQUESTED);
    const seen = noteObjection(undefined, objection.at);
    const after = REQUESTED + 30 * DAY;
    expect(checkRelease(grant, { request, approval: null }, parties, seen, after)).toEqual({
      ok: false,
      error: "objected",
    });
  });

  it("swapped grantee key: Jonas's client wraps only to a certificate the pinned root signed", () => {
    // The server hands Jonas a bundle of its own for Sandra, signed by a root of its own
    const fakeRoot = ed25519KeyPair(new Uint8Array(32).fill(0xee));
    const forged = certify(fakeRoot.secretKey, {
      ...certOf(sandra),
      xwingPublicKey: certOf(max).xwingPublicKey,
    });
    const served: Trust = { ...trust, certificates: new Map(trust.certificates) };
    served.certificates.set(idKey(sandra.id), forged);
    // what the grantor's client takes the grantee from: certificateOf under the pinned root
    expect(certificateOf(served, sandra.id)).toBeUndefined();
    // a grant to someone else's bundle is no grant for Sandra
    const swapped = grantTo(max);
    expect(checkGrant(swapped.grant, me, trust, undefined)).toEqual({
      ok: false,
      error: "not-for-me",
    });
    // and a grant for another bundle under Sandra's ID names another fingerprint than hers
    const toOtherBundle = { ...grant, granteeFingerprint: certificateFingerprint(forged) };
    expect(checkGrant(toOtherBundle, me, trust, undefined)).toEqual({
      ok: false,
      error: "not-for-me",
    });
  });

  it("forged binding: a changed commitment breaks Jonas's signature", () => {
    const item = grant.items[0];
    if (!item) throw new Error("the grant names Büro");
    const forged = { ...grant, items: [{ ...item, commitment: flipByte(item.commitment) }] };
    expect(checkGrant(forged, me, trust, undefined)).toEqual({ ok: false, error: "bad-signature" });
  });

  it("a key without a matching binding in the log: a key the server wrapped is refused", () => {
    const serverKey = new Uint8Array(32).fill(0x99);
    const wrapped = wrapEmergencyVaultKey(
      { publicKey: sandra.xwing.publicKey, fingerprint: sandraReader.fingerprint },
      serverKey,
      { ...ring, grantorId: jonas.id, granteeId: sandra.id },
    );
    const swappedPackage = { vaults: [{ vaultId: ring.vaultId, epoch: 0, wrapped }] };
    expect(openEmergencyVault(grant, swappedPackage, sandraReader, ring.vaultId, log)).toEqual({
      ok: false,
      error: "not-committed",
    });
    // A grantor who signs a key the log never bound passes on nothing either
    const notLogged = grantTo(sandra, { scope: "view", rings: [{ ...ring, vaultKey: serverKey }] });
    expect(
      openEmergencyVault(notLogged.grant, notLogged.packages, sandraReader, ring.vaultId, log),
    ).toEqual({
      ok: false,
      error: "not-in-log",
    });
    expect(openEmergencyVault(grant, packages, sandraReader, ring.vaultId, log).ok).toBe(true);
  });

  it("replayed old grant after a revoke: neither the revoked grant nor an older one counts", () => {
    const revocation = signStatement("emergency-revocation", jonas.ed.secretKey, grant, grant.time);
    const seen = noteRevocation(undefined, revocation.at);
    expect(checkGrant(grant, me, trust, seen)).toEqual({ ok: false, error: "replayed" });
    const older = grantTo(sandra, undefined, { time: GRANTED_AT - 10 });
    expect(checkGrant(older.grant, me, trust, seen)).toEqual({ ok: false, error: "replayed" });
    const renewed = grantTo(sandra, undefined, { time: GRANTED_AT + 10 });
    expect(checkGrant(renewed.grant, me, trust, seen).ok).toBe(true);
  });
});
