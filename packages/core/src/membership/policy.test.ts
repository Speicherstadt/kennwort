import { ed25519KeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import {
  checkPolicy,
  isSignedPolicy,
  LOCK_MINUTES,
  PolicyWire,
  policyToWire,
  signPolicy,
  standardPolicy,
  type UnsignedPolicy,
} from "./policy.ts";

// K-304 part 4 (F-07): the vector was computed with Ed25519 from node:crypto over the same enc()
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const company = new Uint8Array(16).fill(0xc0);
const policy: UnsignedPolicy = {
  companyId: company,
  version: 3,
  lockAfterMinutes: 15,
  companyRecovery: { enabled: true, fingerprint: new Uint8Array(32).fill(9) },
};
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("signPolicy", () => {
  it("matches the vector", () => {
    expect(hex(signPolicy(root.secretKey, policy).signature)).toBe(
      "017bb5785d0dfd1d6be3c729b8b778dd58dde7a4378ae2f8378e0f7e6c300645aa" +
        "206db452683301e3f2e796a1438e27f9f9db65b5ff45a3bbfc7c0f52936e500e",
    );
  });

  it("is checked under the root that signed it, and fails after any change", () => {
    const signed = signPolicy(root.secretKey, policy);
    expect(isSignedPolicy(root.publicKey, signed)).toBe(true);
    expect(isSignedPolicy(ed25519KeyPair().publicKey, signed)).toBe(false);
    for (const changed of [
      { ...signed, companyId: new Uint8Array(16) },
      { ...signed, version: 4 },
      { ...signed, lockAfterMinutes: 60 },
      { ...signed, companyRecovery: { enabled: false as const } },
      { ...signed, companyRecovery: { enabled: true as const, fingerprint: new Uint8Array(32) } },
    ])
      expect(isSignedPolicy(root.publicKey, changed)).toBe(false);
  });

  it("signs recovery off apart from recovery on with an empty fingerprint", () => {
    const off = signPolicy(root.secretKey, { ...policy, companyRecovery: { enabled: false } });
    expect(isSignedPolicy(root.publicKey, off)).toBe(true);
    expect(
      isSignedPolicy(root.publicKey, {
        ...off,
        companyRecovery: { enabled: true, fingerprint: new Uint8Array(32) },
      }),
    ).toBe(false);
  });
});

describe("checkPolicy", () => {
  const signed = signPolicy(root.secretKey, policy);

  it("takes a signed policy of this company not older than the newest seen", () => {
    for (const seen of [0, 2, 3]) {
      const checked = checkPolicy(root.publicKey, company, seen, signed);
      expect(checked).toEqual({ ok: true, value: policy });
    }
  });

  it("refuses an older one, one of another root or company, and none after one was seen", () => {
    expect(checkPolicy(root.publicKey, company, 4, signed)).toEqual({ ok: false, error: "older" });
    expect(checkPolicy(ed25519KeyPair().publicKey, company, 0, signed)).toEqual({
      ok: false,
      error: "not-signed",
    });
    const other = signPolicy(root.secretKey, { ...policy, companyId: new Uint8Array(16) });
    expect(checkPolicy(root.publicKey, company, 0, other)).toEqual({
      ok: false,
      error: "other-company",
    });
    expect(checkPolicy(root.publicKey, company, 1, null)).toEqual({ ok: false, error: "older" });
  });

  it("goes by the standard policy while the company has signed none", () => {
    expect(checkPolicy(root.publicKey, company, 0, null)).toEqual({
      ok: true,
      value: standardPolicy(company),
    });
    expect(standardPolicy(company)).toEqual({
      companyId: company,
      version: 0,
      lockAfterMinutes: 10,
      companyRecovery: { enabled: false },
    });
  });
});

describe("policyToWire", () => {
  it("writes what PolicyWire reads back, with recovery on and off", () => {
    const on = signPolicy(root.secretKey, policy);
    expect(PolicyWire.parse(JSON.parse(JSON.stringify(policyToWire(on))))).toEqual(on);
    const off = signPolicy(root.secretKey, { ...policy, companyRecovery: { enabled: false } });
    expect(policyToWire(off).companyRecovery).toEqual({ enabled: false });
    expect(PolicyWire.parse(policyToWire(off))).toEqual(off);
  });
});

describe("PolicyWire", () => {
  const wire = {
    companyId: encodeBytes(company),
    version: 1,
    lockAfterMinutes: 10,
    companyRecovery: { enabled: false },
    signature: encodeBytes(new Uint8Array(65)),
  };

  it("reads a policy with recovery off or on", () => {
    expect(PolicyWire.parse(wire).lockAfterMinutes).toBe(10);
    const on = {
      ...wire,
      companyRecovery: { enabled: true, fingerprint: encodeBytes(new Uint8Array(32)) },
    };
    expect(PolicyWire.parse(on).companyRecovery).toEqual({
      enabled: true,
      fingerprint: new Uint8Array(32),
    });
  });

  it("refuses lock times outside one to sixty minutes and other malformed policies", () => {
    expect(LOCK_MINUTES).toEqual({ min: 1, max: 60, standard: 10 });
    for (const bad of [
      { ...wire, lockAfterMinutes: 0 },
      { ...wire, lockAfterMinutes: 61 },
      { ...wire, lockAfterMinutes: 1.5 },
      { ...wire, version: 0 },
      { ...wire, version: 1.5 },
      { ...wire, companyRecovery: { enabled: true } },
      { ...wire, companyRecovery: { enabled: true, fingerprint: "AAAA" } },
      { ...wire, signature: "AAAA" },
      { ...wire, companyId: "AAAA" },
    ])
      expect(PolicyWire.safeParse(bad).success).toBe(false);
    expect(PolicyWire.safeParse({ ...wire, lockAfterMinutes: 1 }).success).toBe(true);
    expect(PolicyWire.safeParse({ ...wire, lockAfterMinutes: 60 }).success).toBe(true);
  });
});
