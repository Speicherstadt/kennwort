import { ed25519KeyPair, rootFingerprint, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { type Certificate, certify } from "./certificate.ts";
import {
  CompanyWire,
  checkMembers,
  MembersWire,
  newerCertificates,
  trustedRoot,
} from "./members.ts";

// K-304 part 2: what a client can say about each member, whatever the server claims
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const company = new Uint8Array(16).fill(0xc0);
const person = (seed: number) => ({
  id: new Uint8Array(16).fill(seed),
  xwing: xwingKeyPair(new Uint8Array(32).fill(seed)).publicKey,
  ed: ed25519KeyPair(new Uint8Array(32).fill(seed)).publicKey,
});
const jonas = person(0x10);
const anna = person(0x20);
const cert = (p: ReturnType<typeof person>, role: Certificate["role"], key = root.secretKey) =>
  certify(key, {
    accountId: p.id,
    xwingPublicKey: p.xwing,
    edPublicKey: p.ed,
    companyId: company,
    role,
    issuedAt: 1,
  });
const row = (
  p: ReturnType<typeof person>,
  extra: Partial<Parameters<typeof checkMembers>[1][number]> = {},
) => ({
  id: p.id,
  role: "member" as const,
  name: null,
  xwingPublicKey: p.xwing,
  edPublicKey: p.ed,
  certificate: null,
  invitation: null,
  ...extra,
});
const invitation = (byte: number) => ({
  id: new Uint8Array(16).fill(byte),
  sealedSecret: new Uint8Array(73),
  mac: new Uint8Array(64),
});

describe("trustedRoot", () => {
  it("takes the served root key only when it matches the pinned fingerprint", () => {
    const pinned = rootFingerprint(root.publicKey);
    expect(trustedRoot(pinned, root.publicKey)).toEqual(root.publicKey);
    expect(trustedRoot(pinned, ed25519KeyPair().publicKey)).toBeUndefined();
    expect(trustedRoot(pinned, null)).toBeUndefined();
  });
});

describe("CompanyWire", () => {
  it("reads the company with or without its root key", () => {
    const key = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
    expect(CompanyWire.parse({ id: "weber", rootPublicKey: key })).toEqual({
      id: "weber",
      rootPublicKey: new Uint8Array(32).fill(1),
      policy: null,
      recoveryPublicKey: null,
    });
    expect(CompanyWire.parse({ id: "weber", rootPublicKey: null }).rootPublicKey).toBeNull();
    expect(CompanyWire.safeParse({ id: "", rootPublicKey: null }).success).toBe(false);
    expect(CompanyWire.safeParse({ id: "weber", rootPublicKey: "kurz" }).success).toBe(false);
    expect(CompanyWire.safeParse({ id: "weber" }).success).toBe(false);
    expect(CompanyWire.safeParse({ id: "weber", rootPublicKey: null, policy: {} }).success).toBe(
      false,
    );
  });
});

describe("checkMembers", () => {
  it("shows a member certified by the pinned root for its account, keys and role", () => {
    const [view] = checkMembers(root.publicKey, [
      row(jonas, { role: "owner", name: "Jonas", certificate: cert(jonas, "owner") }),
    ]);
    expect(view).toMatchObject({
      accountId: jonas.id,
      name: "Jonas",
      role: "owner",
      status: "certified",
    });
    expect(view?.certificate?.role).toBe("owner");
  });

  it("passes on when a member left the company, as the server says (K-307)", () => {
    const views = checkMembers(root.publicKey, [
      row(jonas),
      row(anna, { leftAt: 1_800_000_000_000 }),
      row(person(0x30), { leftAt: null }),
    ]);
    expect(views.map((view) => view.leftAt)).toEqual([null, 1_800_000_000_000, null]);
  });

  it("calls a certificate invalid when it does not fit what is listed", () => {
    const mallory = ed25519KeyPair(new Uint8Array(32).fill(0x66));
    const cases = [
      row(anna, { certificate: cert(anna, "member", mallory.secretKey) }),
      row(anna, { certificate: cert(anna, "admin") }),
      row(anna, { role: "admin", certificate: cert(anna, "member") }),
      row(anna, { certificate: cert(jonas, "member") }),
      row(anna, { certificate: { ...cert(anna, "member"), accountId: jonas.id } }),
      row(anna, { xwingPublicKey: jonas.xwing, certificate: cert(anna, "member") }),
      row(anna, { edPublicKey: jonas.ed, certificate: cert(anna, "member") }),
      row(anna, { xwingPublicKey: null, certificate: cert(anna, "member") }),
      row(anna, { edPublicKey: null, certificate: cert(anna, "member") }),
    ];
    for (const member of cases)
      expect(checkMembers(root.publicKey, [member])[0]?.status).toBe("invalid");
  });

  it("offers a member to confirm only with its invitation and both keys", () => {
    const [pending] = checkMembers(root.publicKey, [row(anna, { invitation: invitation(1) })]);
    expect(pending?.status).toBe("pending");
    expect(pending?.pending).toEqual({
      accountId: anna.id,
      xwingPublicKey: anna.xwing,
      edPublicKey: anna.ed,
      invitation: invitation(1),
    });
    for (const member of [
      row(anna),
      row(anna, { invitation: invitation(1), xwingPublicKey: null }),
      row(anna, { invitation: invitation(1), edPublicKey: null }),
    ]) {
      const [view] = checkMembers(root.publicKey, [member]);
      expect(view?.status).toBe("waiting");
      expect(view?.pending).toBeUndefined();
    }
  });

  it("does not count a certificate older than the newest seen for the account", () => {
    const listed = row(anna, { certificate: cert(anna, "member") });
    const id = Buffer.from(anna.id).toString("base64url");
    for (const [seen, status] of [
      [0, "certified"],
      [1, "certified"],
      [2, "invalid"],
    ] as const)
      expect(checkMembers(root.publicKey, [listed], { [id]: seen })[0]?.status).toBe(status);
  });

  it("names the newer issue times to remember, and nothing when none is newer", () => {
    const views = checkMembers(root.publicKey, [
      row(jonas, { role: "owner", certificate: cert(jonas, "owner") }),
      row(anna),
    ]);
    const id = Buffer.from(jonas.id).toString("base64url");
    expect(newerCertificates(views, {})).toEqual({ [id]: 1 });
    expect(newerCertificates(views, { [id]: 1 })).toBeUndefined();
    expect(newerCertificates(views, { [id]: 0, other: 4 })).toEqual({ [id]: 1, other: 4 });
    expect(newerCertificates(views, { [id]: 2 })).toBeUndefined();
  });

  it("refuses to offer one invitation for two accounts", () => {
    const views = checkMembers(root.publicKey, [
      row(anna, { invitation: invitation(1) }),
      row(jonas, { invitation: invitation(1) }),
      row(person(0x30), { invitation: invitation(2) }),
    ]);
    expect(views.map((v) => v.status)).toEqual(["invalid", "invalid", "pending"]);
  });

  it("reads the server's list and refuses one that is not", () => {
    const wire = {
      members: [
        {
          id: "EBAQEBAQEBAQEBAQEBAQEA",
          role: "owner",
          name: null,
          xwingPublicKey: null,
          edPublicKey: null,
          certificate: null,
          invitation: null,
        },
      ],
    };
    expect(MembersWire.parse(wire).members[0]?.id).toEqual(jonas.id);
    const pending = {
      ...wire.members[0],
      invitation: { id: "AQEBAQEBAQEBAQEBAQEBAQ", sealedSecret: "AAAA", mac: "A".repeat(86) },
    };
    expect(MembersWire.parse({ members: [pending] }).members[0]?.invitation?.mac).toHaveLength(64);
    const short = { ...pending, invitation: { ...pending.invitation, mac: "AAAA" } };
    expect(MembersWire.safeParse({ members: [short] }).success).toBe(false);
    for (const role of ["owner", "admin", "member"])
      expect(MembersWire.parse({ members: [{ ...wire.members[0], role }] }).members[0]?.role).toBe(
        role,
      );
    expect(MembersWire.safeParse({ members: [{ ...wire.members[0], role: "chef" }] }).success).toBe(
      false,
    );
  });
});
