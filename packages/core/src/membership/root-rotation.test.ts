import { ed25519KeyPair, isSignedRootChange, newKeyBlock, rootFingerprint } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { type Certificate, certify, isCertified } from "./certificate.ts";
import type { MemberView } from "./members.ts";
import { isSignedPolicy, PolicyWire, type UnsignedPolicy } from "./policy.ts";
import { openRootGrant } from "./root-grant.ts";
import { RootRotationWire, rootRotationToWire, rotateRoot } from "./root-rotation.ts";

// Jonas replaces the root after Sandra, an admin, left Weber Haustechnik (K-307 part f, P-07)
const oldRoot = ed25519KeyPair(new Uint8Array(32).fill(1));
const newRoot = ed25519KeyPair(new Uint8Array(32).fill(2));
const company = new Uint8Array(16).fill(0xc0);
const block = () => newKeyBlock(rootFingerprint(newRoot.publicKey));
const people = { jonas: block(), anna: block(), max: block(), sandra: block(), petra: block() };
const idOf = (byte: number) => new Uint8Array(16).fill(byte);
const cert = (
  keys: ReturnType<typeof block>,
  account: number,
  role: Certificate["role"],
  issuedAt = 100,
): Certificate =>
  certify(oldRoot.secretKey, {
    accountId: idOf(account),
    xwingPublicKey: keys.xwing.publicKey,
    edPublicKey: keys.ed.publicKey,
    companyId: company,
    role,
    issuedAt,
  });
const view = (certificate: Certificate, extra: Partial<MemberView> = {}): MemberView => ({
  accountId: certificate.accountId,
  name: null,
  role: certificate.role,
  status: "certified",
  certificate,
  leftAt: null,
  ...extra,
});
const views: MemberView[] = [
  view(cert(people.jonas, 1, "owner")),
  view(cert(people.anna, 2, "admin", 150)),
  view(cert(people.max, 3, "member")),
  view(cert(people.sandra, 4, "admin"), { leftAt: 5 }),
  (({ certificate: _, ...pending }) => ({ ...pending, status: "pending" as const }))(
    view(cert(people.petra, 5, "member")),
  ),
];
const policy: UnsignedPolicy = {
  companyId: company,
  version: 3,
  lockAfterMinutes: 25,
  companyRecovery: { enabled: true, fingerprint: new Uint8Array(32).fill(7) },
};
const NOW = 1_000;
const input = {
  rootSecretKey: oldRoot.secretKey,
  companyId: company,
  views,
  policy,
  now: NOW,
  seen: { [encodeBytes(idOf(3))]: 2_000 },
  newRootSecretKey: newRoot.secretKey,
};
const rotation = rotateRoot(input);

describe("a new company root (rotateRoot)", () => {
  it("signs the change from the old root to the new one for this company, now", () => {
    expect(rotation.change).toMatchObject({
      companyId: company,
      oldRootPublicKey: oldRoot.publicKey,
      newRootPublicKey: newRoot.publicKey,
      time: NOW,
    });
    expect(isSignedRootChange(rotation.change)).toBe(true);
    expect(rotation.rootSecretKey).toEqual(newRoot.secretKey);
  });

  it("certifies anew exactly the confirmed members still in, same bundle and role", () => {
    expect(rotation.certificates.map((c) => c.accountId)).toEqual([idOf(1), idOf(2), idOf(3)]);
    for (const [index, c] of rotation.certificates.entries()) {
      const before = views[index]?.certificate as Certificate;
      expect(isCertified(newRoot.publicKey, c)).toBe(true);
      expect({ ...c, issuedAt: 0, signature: 0 }).toEqual({
        ...before,
        issuedAt: 0,
        signature: 0,
      });
    }
  });

  it("issues each certificate later than the old one and than every one seen", () => {
    expect(rotation.certificates.map((c) => c.issuedAt)).toEqual([NOW, NOW, 2_001]);
    const late = rotateRoot({ ...input, now: 120 });
    expect(late.certificates.map((c) => c.issuedAt)).toEqual([120, 151, 2_001]);
  });

  it("wraps the new root to every owner and admin still in, the rotating one included", () => {
    expect(rotation.grants.map((g) => g.accountId)).toEqual([idOf(1), idOf(2)]);
    const [jonas, anna] = rotation.grants;
    for (const [grant, keys, account] of [
      [jonas, people.jonas, 1],
      [anna, people.anna, 2],
    ] as const) {
      const opened = openRootGrant(keys, idOf(account), company, grant?.grant as Uint8Array);
      expect(opened).toEqual({ ok: true, value: newRoot.secretKey });
    }
  });

  it("signs the next policy under the new root with the same lock time and recovery key", () => {
    expect(rotation.policy).toMatchObject({ ...policy, version: 4 });
    expect(isSignedPolicy(newRoot.publicKey, rotation.policy)).toBe(true);
    expect(isSignedPolicy(oldRoot.publicKey, rotation.policy)).toBe(false);
  });

  it("makes a random new root unless one is given", () => {
    const { newRootSecretKey: _, ...withoutKey } = input;
    const random = rotateRoot(withoutKey);
    expect(random.rootSecretKey).not.toEqual(newRoot.secretKey);
    expect(random.change.newRootPublicKey).toEqual(ed25519KeyPair(random.rootSecretKey).publicKey);
  });

  it("goes over the wire and back unchanged", () => {
    const { rootSecretKey: _, ...sent } = rotation;
    const parsed = RootRotationWire.parse(JSON.parse(JSON.stringify(rootRotationToWire(sent))));
    expect(parsed).toEqual({ ...sent, policy: PolicyWire.parse(rootRotationToWire(sent).policy) });
  });
});
