import { describe, expect, it } from "vitest";
import vectors from "../vectors/root-change-v1.json" with { type: "json" };
import { rootFingerprint } from "./fingerprint.ts";
import { isSignedRootChange, rootChangeMessage, signRootChange } from "./root-change.ts";
import { ed25519KeyPair } from "./sign.ts";
import { fromHex, hex } from "./test-helpers.ts";

// F-14 v1, computed with libsodium and node:crypto (generate-root-change.ts)
describe.each(vectors.changes)("F-14 root change vector: $name", (vector) => {
  const oldRoot = ed25519KeyPair(fromHex(vector.oldSeed));
  const newRoot = ed25519KeyPair(fromHex(vector.newSeed));
  const companyId = fromHex(vector.companyId);
  const signed = signRootChange(oldRoot.secretKey, newRoot.secretKey, companyId, vector.time);

  it("derives the same keys and the old root's fingerprint", () => {
    expect(hex(oldRoot.publicKey)).toBe(vector.oldRootPublicKey);
    expect(hex(newRoot.publicKey)).toBe(vector.newRootPublicKey);
    expect(hex(rootFingerprint(oldRoot.publicKey))).toBe(vector.oldFingerprint);
  });

  it("encodes the statement to the same bytes", () => {
    expect(hex(rootChangeMessage(signed))).toBe(vector.message);
  });

  it("signs to the same two signatures, which verify", () => {
    expect(hex(signed.oldSignature)).toBe(vector.oldSignature);
    expect(hex(signed.newSignature)).toBe(vector.newSignature);
    expect(
      isSignedRootChange({
        companyId,
        oldRootPublicKey: fromHex(vector.oldRootPublicKey),
        newRootPublicKey: fromHex(vector.newRootPublicKey),
        time: vector.time,
        oldSignature: fromHex(vector.oldSignature),
        newSignature: fromHex(vector.newSignature),
      }),
    ).toBe(true);
  });
});
