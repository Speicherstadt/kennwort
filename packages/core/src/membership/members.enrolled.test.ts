import { ed25519KeyPair, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { type Certificate, certify, isCertified } from "./certificate.ts";
import { certifyEnrolled, checkMembers, MembersWire, type MemberView } from "./members.ts";

// K-604: Sandra signed in through the company's identity provider and enrolled (P-25); an owner or
// admin compares the code of her keys with her and certifies them, as a member and nothing else
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const company = new Uint8Array(16).fill(0xc0);
const sandraId = new Uint8Array(16).fill(0x40);
const keys = {
  xwing: xwingKeyPair(new Uint8Array(32).fill(0x41)).publicKey,
  ed: ed25519KeyPair(new Uint8Array(32).fill(0x41)).publicKey,
};
const row = (extra: Partial<Parameters<typeof checkMembers>[1][number]> = {}) => ({
  id: sandraId,
  role: "member" as const,
  name: null,
  xwingPublicKey: keys.xwing,
  edPublicKey: keys.ed,
  certificate: null,
  invitation: null,
  oidc: true,
  ...extra,
});
const viewOf = (extra: Parameters<typeof row>[0] = {}) =>
  checkMembers(root.publicKey, [row(extra)])[0] as MemberView;
const certificate = (issuedAt: number, role: "member" | "admin" = "member"): Certificate =>
  certify(root.secretKey, {
    accountId: sandraId,
    xwingPublicKey: keys.xwing,
    edPublicKey: keys.ed,
    companyId: company,
    role,
    issuedAt,
  });

describe("a member who enrolled through the identity provider", () => {
  it("shows as enrolled with her bundle while she has no certificate", () => {
    expect(viewOf()).toMatchObject({
      status: "enrolled",
      enrolled: { accountId: sandraId, xwingPublicKey: keys.xwing, edPublicKey: keys.ed },
    });
  });

  it("is waiting without the provider's mark, or while her keys are not there", () => {
    expect(viewOf({ oidc: false }).status).toBe("waiting");
    expect(viewOf({ oidc: undefined }).status).toBe("waiting");
    expect(viewOf({ xwingPublicKey: null }).status).toBe("waiting");
    expect(viewOf({ edPublicKey: null }).status).toBe("waiting");
    expect(viewOf({ xwingPublicKey: null }).enrolled).toBeUndefined();
  });

  it("is pending for an open invitation, and certified once certified", () => {
    const invitation = {
      id: new Uint8Array(16).fill(7),
      sealedSecret: new Uint8Array(73),
      mac: new Uint8Array(64),
    };
    expect(viewOf({ invitation }).status).toBe("pending");
    expect(viewOf({ certificate: certificate(100) }).status).toBe("certified");
  });

  it("reads the mark from the wire, absent as no mark", () => {
    const wire = {
      ...row(),
      id: "QEBAQEBAQEBAQEBAQEBAQA",
      xwingPublicKey: null,
      edPublicKey: null,
    };
    const parsed = MembersWire.parse({ members: [wire] }).members[0];
    expect(parsed?.oidc).toBe(true);
    const { oidc: _, ...without } = wire;
    expect(MembersWire.parse({ members: [without] }).members[0]?.oidc).toBeUndefined();
  });
});

describe("certifyEnrolled", () => {
  it("certifies her bundle as a member of the company, now", () => {
    const made = certifyEnrolled(root.secretKey, viewOf(), company, 500);
    expect(made).toEqual(certificate(500));
    expect(made && isCertified(root.publicKey, made)).toBe(true);
  });

  it("certifies a member even when the server lists a higher role", () => {
    const made = certifyEnrolled(root.secretKey, viewOf({ role: "admin" }), company, 500);
    expect(made?.role).toBe("member");
  });

  it("certifies nothing that is not enrolled", () => {
    expect(certifyEnrolled(root.secretKey, viewOf({ oidc: false }), company, 500)).toBeUndefined();
    const certified = viewOf({ certificate: certificate(100) });
    expect(certifyEnrolled(root.secretKey, certified, company, 500)).toBeUndefined();
    // The bundle alone is not enough: the status must say enrolled
    expect(certifyEnrolled(root.secretKey, { ...viewOf(), status: "waiting" }, company, 500)).toBe(
      undefined,
    );
    const { enrolled: _, ...noBundle } = viewOf();
    expect(certifyEnrolled(root.secretKey, noBundle, company, 500)).toBeUndefined();
  });
});
