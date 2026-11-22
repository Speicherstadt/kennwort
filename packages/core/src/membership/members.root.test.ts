import { ed25519KeyPair, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { type Certificate, certify } from "./certificate.ts";
import { CompanyWire, checkMembers } from "./members.ts";

// Weber Haustechnik after the root changed (K-307 part f): Anna got a certificate of the new root,
// Sandra left before the change and keeps only the old root's
const oldRoot = ed25519KeyPair(new Uint8Array(32).fill(1));
const newRoot = ed25519KeyPair(new Uint8Array(32).fill(2));
const company = new Uint8Array(16).fill(0xc0);
const person = (seed: number) => ({
  id: new Uint8Array(16).fill(seed),
  xwing: xwingKeyPair(new Uint8Array(32).fill(seed)).publicKey,
  ed: ed25519KeyPair(new Uint8Array(32).fill(seed)).publicKey,
});
const anna = person(0x20);
const sandra = person(0x40);
const cert = (p: ReturnType<typeof person>, key: Uint8Array, issuedAt: number): Certificate =>
  certify(key, {
    accountId: p.id,
    xwingPublicKey: p.xwing,
    edPublicKey: p.ed,
    companyId: company,
    role: "admin",
    issuedAt,
  });
const row = (p: ReturnType<typeof person>, certificate: Certificate, previous: Certificate[]) => ({
  id: p.id,
  role: "admin" as const,
  name: null,
  xwingPublicKey: p.xwing,
  edPublicKey: p.ed,
  certificate,
  invitation: null,
  previous,
});
const retired = [{ publicKey: oldRoot.publicKey, until: 50 }];
const members = [
  row(anna, cert(anna, newRoot.secretKey, 60), [cert(anna, oldRoot.secretKey, 10)]),
  row(sandra, cert(sandra, oldRoot.secretKey, 10), []),
];

describe("members after the root changed", () => {
  it("confirms the re-certified member and keeps her old root's certificate as history", () => {
    const [annaView] = checkMembers(newRoot.publicKey, members, {}, retired);
    expect(annaView).toMatchObject({
      status: "certified",
      certificate: cert(anna, newRoot.secretKey, 60),
      previous: [cert(anna, oldRoot.secretKey, 10)],
    });
  });

  it("shows the departed admin's old root certificate as former, never as certified", () => {
    const [, sandraView] = checkMembers(newRoot.publicKey, members, {}, retired);
    expect(sandraView).toMatchObject({
      status: "former",
      certificate: cert(sandra, oldRoot.secretKey, 10),
    });
  });

  it("takes neither as trusted without the confirmed change", () => {
    const [annaView, sandraView] = checkMembers(newRoot.publicKey, members, {});
    expect(annaView?.status).toBe("certified");
    expect(annaView?.previous).toEqual([]);
    expect(sandraView?.status).toBe("invalid");
  });

  it("does not take an old root certificate older than one seen", () => {
    const [, sandraView] = checkMembers(
      newRoot.publicKey,
      members,
      { [encodeBytes(sandra.id)]: 11 },
      retired,
    );
    expect(sandraView?.status).toBe("invalid");
  });
});

describe("certificates the old root issued after the change", () => {
  // Sandra kept the old root: whatever she certifies after the change counts for nothing
  const late = (issuedAt: number) => [
    row(anna, cert(anna, newRoot.secretKey, 400), [cert(anna, oldRoot.secretKey, issuedAt)]),
    row(sandra, cert(sandra, oldRoot.secretKey, issuedAt), []),
  ];

  it("count neither as former nor in the history", () => {
    const [annaView, sandraView] = checkMembers(newRoot.publicKey, late(50 + 300), {}, retired);
    expect(annaView?.previous).toEqual([]);
    expect(sandraView?.status).toBe("invalid");
  });

  it("count when issued before the change, give or take the clock skew", () => {
    const [annaView, sandraView] = checkMembers(newRoot.publicKey, late(50 + 299), {}, retired);
    expect(annaView?.previous).toHaveLength(1);
    expect(sandraView?.status).toBe("former");
  });
});

describe("several replaced roots", () => {
  it("takes a certificate of any one of them, not only of all", () => {
    const earlier = ed25519KeyPair(new Uint8Array(32).fill(3));
    const both = [{ publicKey: earlier.publicKey, until: 20 }, ...retired];
    const [annaView, sandraView] = checkMembers(newRoot.publicKey, members, {}, both);
    expect(annaView?.previous).toHaveLength(1);
    expect(sandraView?.status).toBe("former");
  });
});

describe("CompanyWire with root changes", () => {
  it("reads the changes, and none when the server sends none", () => {
    const base = { id: "c", rootPublicKey: null };
    expect(CompanyWire.parse(base).rootChanges).toBeUndefined();
    expect(CompanyWire.parse({ ...base, rootChanges: [] }).rootChanges).toEqual([]);
  });
});
