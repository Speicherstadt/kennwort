import { ed25519KeyPair, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { type Certificate, certify, isCertified } from "./certificate.ts";
import { certifyRenewed, checkMembers, MembersWire, type MemberView } from "./members.ts";

// K-307 part e: Anna renewed her keys after her recovery kit got into other hands (P-12)
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const company = new Uint8Array(16).fill(0xc0);
const annaId = new Uint8Array(16).fill(0x20);
const bundle = (seed: number) => ({
  xwing: xwingKeyPair(new Uint8Array(32).fill(seed)).publicKey,
  ed: ed25519KeyPair(new Uint8Array(32).fill(seed)).publicKey,
});
const old = bundle(0x20);
const fresh = bundle(0x21);
const cert = (
  keys: typeof old,
  issuedAt: number,
  key = root.secretKey,
  accountId = annaId,
): Certificate =>
  certify(key, {
    accountId,
    xwingPublicKey: keys.xwing,
    edPublicKey: keys.ed,
    companyId: company,
    role: "admin",
    issuedAt,
  });
const row = (extra: Partial<Parameters<typeof checkMembers>[1][number]> = {}) => ({
  id: annaId,
  role: "admin" as const,
  name: "Anna",
  xwingPublicKey: fresh.xwing,
  edPublicKey: fresh.ed,
  certificate: null,
  invitation: null,
  previous: [cert(old, 100)],
  ...extra,
});
const viewOf = (extra: Parameters<typeof row>[0] = {}, seen = {}) =>
  checkMembers(root.publicKey, [row(extra)], seen)[0] as MemberView;

describe("a member who renewed her keys", () => {
  it("shows as renewed with the new bundle, and her earlier certificate", () => {
    const view = viewOf();
    expect(view.status).toBe("renewed");
    expect(view.renewed).toEqual({
      accountId: annaId,
      xwingPublicKey: fresh.xwing,
      edPublicKey: fresh.ed,
    });
    expect(view.previous).toEqual([cert(old, 100)]);
    expect(view.certificate).toBeUndefined();
  });

  it("is waiting, not renewed, without an earlier certificate the root signed for her", () => {
    expect(viewOf({ previous: [] }).status).toBe("waiting");
    expect(viewOf({ previous: undefined }).status).toBe("waiting");
    const stray = ed25519KeyPair(new Uint8Array(32).fill(9)).secretKey;
    expect(viewOf({ previous: [cert(old, 100, stray)] }).status).toBe("waiting");
    const forMax = cert(old, 100, root.secretKey, new Uint8Array(16).fill(0x30));
    expect(viewOf({ previous: [forMax] })).toMatchObject({ status: "waiting", previous: [] });
  });

  it("is waiting while her keys are not there, and pending for an open invitation", () => {
    expect(viewOf({ xwingPublicKey: null }).status).toBe("waiting");
    expect(viewOf({ edPublicKey: null }).status).toBe("waiting");
    const invitation = {
      id: new Uint8Array(16).fill(7),
      sealedSecret: new Uint8Array(73),
      mac: new Uint8Array(64),
    };
    expect(viewOf({ invitation }).status).toBe("pending");
  });

  it("keeps only earlier certificates older than the current one", () => {
    const view = viewOf({
      certificate: cert(fresh, 200),
      previous: [cert(old, 100), cert(old, 200), cert(old, 300)],
    });
    expect(view.status).toBe("certified");
    expect(view.previous).toEqual([cert(old, 100)]);
    expect(view.renewed).toBeUndefined();
  });

  it("reads earlier certificates off the wire, and none when the server sends none", () => {
    const wire = (previous?: unknown) => ({
      members: [
        {
          id: "ICAgICAgICAgICAgICAgIA",
          role: "admin",
          name: null,
          xwingPublicKey: null,
          edPublicKey: null,
          certificate: null,
          invitation: null,
          ...(previous === undefined ? {} : { previous }),
        },
      ],
    });
    expect(MembersWire.parse(wire()).members[0]?.previous).toBeUndefined();
    expect(MembersWire.parse(wire([])).members[0]?.previous).toEqual([]);
    expect(MembersWire.safeParse(wire([{}])).success).toBe(false);
  });
});

describe("certifyRenewed", () => {
  it("certifies the new bundle with her role, later than every certificate seen", () => {
    const made = certifyRenewed(root.secretKey, viewOf(), company, 50, 0) as Certificate;
    expect(isCertified(root.publicKey, made)).toBe(true);
    expect(made).toMatchObject({
      accountId: annaId,
      xwingPublicKey: fresh.xwing,
      edPublicKey: fresh.ed,
      companyId: company,
      role: "admin",
      issuedAt: 101,
    });
    expect(certifyRenewed(root.secretKey, viewOf(), company, 50, 400)?.issuedAt).toBe(401);
    expect(certifyRenewed(root.secretKey, viewOf(), company, 900, 400)?.issuedAt).toBe(900);
    const { previous: _, ...unlisted } = viewOf();
    expect(certifyRenewed(root.secretKey, unlisted, company, 1, 0)?.issuedAt).toBe(1);
  });

  it("certifies nothing for a member whose status is not renewed, whatever bundle the view carries", () => {
    const certified = { ...viewOf(), status: "certified" as const };
    expect(certifyRenewed(root.secretKey, certified, company, 50, 0)).toBeUndefined();
  });

  it("certifies nothing for a member who did not renew", () => {
    expect(
      certifyRenewed(root.secretKey, viewOf({ previous: [] }), company, 50, 0),
    ).toBeUndefined();
    const { renewed: __, ...noBundle } = viewOf();
    expect(certifyRenewed(root.secretKey, noBundle, company, 50, 0)).toBeUndefined();
  });
});
