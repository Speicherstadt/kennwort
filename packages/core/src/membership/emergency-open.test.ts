import { vaultKeyCommitment } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import {
  blockOf,
  certificate,
  DAY,
  fullGrant,
  GRANTED_AT,
  grantTo,
  jonas,
  jonasAccountKey,
  jonasSealedBlock,
  parties,
  requestBy,
  ring,
  sandra,
  sandraReader,
} from "../sync/test/emergency.ts";
import { anna, id, log } from "../sync/test/fixtures.ts";
import { signStatement } from "./emergency.ts";
import { checkRelease, openEmergencyAccount, openEmergencyVault } from "./emergency-open.ts";

const { grant, packages } = grantTo();
const REQUESTED = GRANTED_AT + 100;
const request = requestBy(sandra, grant, REQUESTED);
const approval = signStatement("emergency-approval", jonas.ed.secretKey, grant, REQUESTED);
const ends = REQUESTED + 7 * DAY;
const refused = (error: string) => ({ ok: false, error });
const release = (changes: object = {}) => ({ request, approval: null, ...changes });

describe("checking a release (P-14)", () => {
  it("lets the packages be used once the waiting time is over by the grantee's clock", () => {
    expect(checkRelease(grant, release(), parties, undefined, ends)).toEqual({
      ok: true,
      value: true,
    });
    expect(checkRelease(grant, release(), parties, undefined, ends - 1)).toEqual(
      refused("waiting"),
    );
  });

  it("before that only with the grantor's signed approval of this very request", () => {
    expect(checkRelease(grant, release({ approval }), parties, undefined, REQUESTED).ok).toBe(true);
    const other = signStatement("emergency-approval", jonas.ed.secretKey, grant, REQUESTED + 1);
    const byGrantee = signStatement("emergency-approval", sandra.ed.secretKey, grant, REQUESTED);
    const asObjection = signStatement("emergency-objection", jonas.ed.secretKey, grant, REQUESTED);
    for (const wrong of [other, byGrantee, asObjection])
      expect(
        checkRelease(grant, release({ approval: wrong }), parties, undefined, REQUESTED),
      ).toEqual(refused("waiting"));
  });

  it("answers only the grantee's own request for this grant", () => {
    const byAnna = requestBy(anna, grant, REQUESTED);
    const forAnna = requestBy(sandra, { ...grant, grantee: anna.id }, REQUESTED);
    for (const wrong of [byAnna, forAnna])
      expect(checkRelease(grant, release({ request: wrong }), parties, undefined, ends)).toEqual(
        refused("not-my-request"),
      );
  });

  it("never for an old request and approval played back against a newer full grant", () => {
    // Review of K-307 part d: statements name the exact grant, so view never turns into full
    const full = fullGrant(GRANTED_AT + 500).grant;
    const asFull = release({ approval });
    expect(checkRelease(full, asFull, parties, undefined, REQUESTED)).toEqual(
      refused("not-my-request"),
    );
    expect(checkRelease(full, release(), parties, undefined, ends)).toEqual(
      refused("not-my-request"),
    );
    const fresh = requestBy(sandra, full, REQUESTED + 600);
    expect(
      checkRelease(
        full,
        release({ request: fresh, approval }),
        parties,
        undefined,
        REQUESTED + 600,
      ),
    ).toEqual(refused("waiting"));
  });

  it("never for a request the grantor objected to, approved or not", () => {
    const seen = { grant: GRANTED_AT, revoked: false, objected: REQUESTED };
    expect(checkRelease(grant, release({ approval }), parties, seen, ends)).toEqual(
      refused("objected"),
    );
    const later = requestBy(sandra, grant, REQUESTED + 1);
    expect(checkRelease(grant, release({ request: later }), parties, seen, ends + 1).ok).toBe(true);
  });
});

describe("opening a vault of a view grant (P-14)", () => {
  it("gives the vault key that the grant and the vault's log both bind", () => {
    expect(openEmergencyVault(grant, packages, sandraReader, ring.vaultId, log)).toEqual({
      ok: true,
      value: ring,
    });
  });

  it("has no package for a vault the grant does not name, or for another epoch", () => {
    expect(openEmergencyVault(grant, packages, sandraReader, id(0xb1), log)).toEqual(
      refused("no-package"),
    );
    const otherEpoch = { vaults: packages.vaults.map((p) => ({ ...p, epoch: 1 })) };
    expect(openEmergencyVault(grant, otherEpoch, sandraReader, ring.vaultId, log)).toEqual(
      refused("no-package"),
    );
    expect(openEmergencyVault(grant, { vaults: [] }, sandraReader, ring.vaultId, log)).toEqual(
      refused("no-package"),
    );
    const unnamed = { vaults: packages.vaults.map((p) => ({ ...p, vaultId: id(0xb1) })) };
    expect(openEmergencyVault(grant, unnamed, sandraReader, id(0xb1), log)).toEqual(
      refused("no-package"),
    );
  });

  it("refuses a key the log does not bind for that epoch", () => {
    const otherKey = new Uint8Array(32).fill(0x56);
    const signedOther = grantTo(sandra, {
      scope: "view",
      rings: [{ ...ring, vaultKey: otherKey }],
    });
    expect(
      openEmergencyVault(signedOther.grant, signedOther.packages, sandraReader, ring.vaultId, log),
    ).toEqual(refused("not-in-log"));
    const noEpoch = grantTo(sandra, { scope: "view", rings: [{ ...ring, epoch: 3 }] });
    expect(
      openEmergencyVault(noEpoch.grant, noEpoch.packages, sandraReader, ring.vaultId, log),
    ).toEqual(refused("not-in-log"));
    expect(vaultKeyCommitment(otherKey, ring)).not.toEqual(log.commitments.get(0));
  });

  it("refuses a package for someone else", () => {
    const toAnna = grantTo(anna);
    const swapped = { ...grant, items: toAnna.grant.items };
    expect(openEmergencyVault(swapped, toAnna.packages, sandraReader, ring.vaultId, log)).toEqual(
      refused("not-authentic"),
    );
  });
});

describe("opening the account of a full grant (P-14)", () => {
  const full = fullGrant();
  const found = {
    grantor: certificate(jonas),
    sealedKeyBlock: jonasSealedBlock,
    rootFingerprint: blockOf(jonas).rootFingerprint,
  };

  it("gives the grantor's AK and key block", () => {
    expect(openEmergencyAccount(full.grant, full.packages, sandraReader, found)).toEqual({
      ok: true,
      value: { accountKey: jonasAccountKey, keyBlock: blockOf(jonas) },
    });
  });

  it("has nothing without the package, or for a grant of view access", () => {
    expect(openEmergencyAccount(full.grant, { vaults: [] }, sandraReader, found)).toEqual(
      refused("no-package"),
    );
    expect(openEmergencyAccount(grant, full.packages, sandraReader, found)).toEqual(
      refused("no-package"),
    );
  });

  it("refuses a key block that is not the certified grantor's", () => {
    const asAnna = { ...found, grantor: certificate(anna) };
    expect(openEmergencyAccount(full.grant, full.packages, sandraReader, asAnna)).toEqual(
      refused("wrong-key-block"),
    );
  });
});
