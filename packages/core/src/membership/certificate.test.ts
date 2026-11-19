import { bundleFingerprint, ed25519KeyPair, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { certificateFingerprint, certify, isCertified, type Unsigned } from "./certificate.ts";

const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const anna = {
  ed: ed25519KeyPair(new Uint8Array(32).fill(2)),
  xwing: xwingKeyPair(new Uint8Array(32).fill(2)),
};
const unsigned: Unsigned = {
  accountId: new Uint8Array(16).fill(0xa0),
  xwingPublicKey: anna.xwing.publicKey,
  edPublicKey: anna.ed.publicKey,
  companyId: new Uint8Array(16).fill(0xc0),
  role: "admin",
  issuedAt: 1_800_000_000,
};
const certificate = certify(root.secretKey, unsigned);

describe("certificates (F-06)", () => {
  it("are certified by the root that signed them", () => {
    expect(isCertified(root.publicKey, certificate)).toBe(true);
    expect(isCertified(ed25519KeyPair().publicKey, certificate)).toBe(false);
  });

  it.each([
    ["account", { accountId: new Uint8Array(16) }],
    ["X-Wing key", { xwingPublicKey: xwingKeyPair().publicKey }],
    ["Ed25519 key", { edPublicKey: ed25519KeyPair().publicKey }],
    ["company", { companyId: new Uint8Array(16) }],
    ["role", { role: "owner" as const }],
    ["date", { issuedAt: 1_800_000_001 }],
  ])("fail when the server changes the %s", (_name, change) => {
    expect(isCertified(root.publicKey, { ...certificate, ...change })).toBe(false);
  });

  it("have the fingerprint of the bundle they certify", () => {
    expect(certificateFingerprint(certificate)).toEqual(
      bundleFingerprint(anna.xwing.publicKey, anna.ed.publicKey),
    );
  });
});
