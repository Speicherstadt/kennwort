import { describe, expect, it } from "vitest";
import vectors from "../vectors/emergency-v1.json" with { type: "json" };
import {
  EMERGENCY_STATEMENTS,
  emergencyAccountCommitment,
  emergencyGrantDigest,
  emergencyGrantMessage,
  emergencyStatementMessage,
  unwrapEmergencyVaultKey,
} from "./emergency.ts";
import { bundleFingerprint } from "./fingerprint.ts";
import { ed25519KeyPair, sign, verify } from "./sign.ts";
import { fromHex, hex } from "./test-helpers.ts";
import { vaultKeyCommitment } from "./vault.ts";
import { unwrap, wrapWithRandomness, xwingKeyPair } from "./wrap.ts";

// F-09 v1: every part of a grant, recomputed against libsodium and node:crypto (generate-emergency.ts)
const parties = { grantorId: fromHex(vectors.grantorId), granteeId: fromHex(vectors.granteeId) };
const companyId = fromHex(vectors.companyId);
const grantee = xwingKeyPair(fromHex(vectors.granteeXwingSeed));
const granteeEd = ed25519KeyPair(fromHex(vectors.granteeEdSeed));
const fingerprint = fromHex(vectors.granteeFingerprint);
const grantorSeed = fromHex(vectors.grantorSeed);
const [view, full] = vectors.grants as [
  (typeof vectors.grants)[0] & { vaultId: string; epoch: number },
  (typeof vectors.grants)[1],
];
const vaultId = fromHex(view.vaultId);
const place = { vaultId, epoch: view.epoch, ...parties };
const randomness = (v: { kemRandomness: string; nonce: string }) => ({
  kem: fromHex(v.kemRandomness),
  nonce: fromHex(v.nonce),
});
const terms = {
  companyId,
  ...parties,
  granteeFingerprint: fingerprint,
  waitSeconds: vectors.waitSeconds,
  time: vectors.time,
};

describe("F-09 vectors: emergency access", () => {
  it("names the grantee by the fingerprint of its bundle (F-04)", () => {
    expect(hex(bundleFingerprint(grantee.publicKey, granteeEd.publicKey))).toBe(
      vectors.granteeFingerprint,
    );
    expect(hex(ed25519KeyPair(grantorSeed).publicKey)).toBe(vectors.grantorPublicKey);
  });

  it("wraps a vault key to the same package, bound as the log binds it", () => {
    const to = { publicKey: grantee.publicKey, fingerprint };
    const where = {
      purpose: "emergency",
      context: [vaultId, view.epoch, ...Object.values(parties)],
    };
    const pkg = wrapWithRandomness(to, fromHex(view.key), where, randomness(view));
    expect(hex(pkg)).toBe(view.package);
    expect(hex(vaultKeyCommitment(fromHex(view.key), place))).toBe(view.commitment);
    const me = { secretKey: grantee.secretKey, fingerprint };
    expect(unwrapEmergencyVaultKey(me, pkg, place, fromHex(view.commitment))).toEqual({
      ok: true,
      value: fromHex(view.key),
    });
  });

  it("wraps AK to the same package with its own commitment", () => {
    const to = { publicKey: grantee.publicKey, fingerprint };
    const where = { purpose: "emergency-account", context: [parties.grantorId, parties.granteeId] };
    const pkg = wrapWithRandomness(to, fromHex(full.key), where, randomness(full));
    expect(hex(pkg)).toBe(full.package);
    expect(unwrap(grantee.secretKey, fingerprint, pkg, where)).toEqual({
      ok: true,
      value: fromHex(full.key),
    });
    expect(hex(emergencyAccountCommitment(fromHex(full.key), parties.grantorId))).toBe(
      full.commitment,
    );
  });

  it("encodes and signs both grants as libsodium does", () => {
    const viewItems = [{ vaultId, epoch: view.epoch, commitment: fromHex(view.commitment) }];
    const messages = [
      emergencyGrantMessage({
        ...terms,
        scope: "view",
        accountCommitment: new Uint8Array(),
        items: viewItems,
      }),
      emergencyGrantMessage({
        ...terms,
        scope: "full",
        accountCommitment: fromHex(full.commitment),
        items: [],
      }),
    ];
    for (const [index, message] of messages.entries()) {
      const vector = vectors.grants[index];
      expect(hex(message)).toBe(vector?.message);
      expect(hex(sign(grantorSeed, "emergency", message))).toBe(vector?.signature);
    }
    const [viewTerms, fullTerms] = [
      { ...terms, scope: "view" as const, accountCommitment: new Uint8Array(), items: viewItems },
      { ...terms, scope: "full" as const, accountCommitment: fromHex(full.commitment), items: [] },
    ];
    expect(hex(emergencyGrantDigest(viewTerms))).toBe(view.digest);
    expect(hex(emergencyGrantDigest(fullTerms))).toBe(full.digest);
  });

  it("encodes and signs every statement as libsodium does, naming its grant, under its purpose", () => {
    expect(vectors.statements.map((s) => s.purpose)).toEqual([...EMERGENCY_STATEMENTS]);
    for (const statement of vectors.statements) {
      expect(statement.grantDigest).toBe(view.digest);
      const grant = { time: statement.grantTime, digest: fromHex(statement.grantDigest) };
      const message = emergencyStatementMessage(companyId, parties, grant, statement.at);
      expect(hex(message)).toBe(statement.message);
      const signer = statement.purpose === "emergency-request" ? granteeEd.publicKey : undefined;
      const publicKey = signer ?? fromHex(vectors.grantorPublicKey);
      expect(verify(publicKey, fromHex(statement.signature), statement.purpose, message)).toBe(
        true,
      );
    }
  });
});
