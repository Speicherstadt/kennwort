import {
  bundleFingerprint,
  ed25519KeyPair,
  newKeyBlock,
  rootFingerprint,
  wrap,
} from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { certify, isCertified } from "./certificate.ts";
import { changeRole, grantRoot, openRootGrant, ROOT_GRANT_LENGTH } from "./root-grant.ts";

// K-304 part 3: Jonas makes Anna an admin; her client takes the root key only if it is the pinned one
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const company = new Uint8Array(16).fill(0xc0);
const annaId = new Uint8Array(16).fill(0x20);
const annaBlock = newKeyBlock(rootFingerprint(root.publicKey));
const annaMember = certify(root.secretKey, {
  accountId: annaId,
  xwingPublicKey: annaBlock.xwing.publicKey,
  edPublicKey: annaBlock.ed.publicKey,
  companyId: company,
  role: "member",
  issuedAt: 1,
});

describe("changeRole", () => {
  it("certifies the new role and wraps the root key for an admin or owner", () => {
    for (const role of ["admin", "owner"] as const) {
      const { certificate, rootGrant } = changeRole(
        root.secretKey,
        annaMember,
        role,
        () => 2_000_999,
      );
      expect(isCertified(root.publicKey, certificate)).toBe(true);
      expect(certificate).toMatchObject({
        accountId: annaId,
        companyId: company,
        role,
        issuedAt: 2000,
      });
      expect(rootGrant).toHaveLength(ROOT_GRANT_LENGTH);
      const opened = openRootGrant(annaBlock, annaId, company, rootGrant ?? new Uint8Array());
      expect(opened).toEqual({ ok: true, value: root.secretKey });
    }
  });

  it("gives a member no root key, and uses the current time by default", () => {
    const { certificate, rootGrant } = changeRole(root.secretKey, annaMember, "member");
    expect(rootGrant).toBeUndefined();
    expect(Math.abs(certificate.issuedAt - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(2);
  });
});

describe("openRootGrant", () => {
  const grant = grantRoot(root.secretKey, { ...annaMember, role: "admin" });

  it("opens only for this account and company", () => {
    expect(openRootGrant(annaBlock, new Uint8Array(16), company, grant)).toEqual({
      ok: false,
      error: "not-authentic",
    });
    expect(openRootGrant(annaBlock, annaId, new Uint8Array(16), grant)).toEqual({
      ok: false,
      error: "not-authentic",
    });
    const other = newKeyBlock(rootFingerprint(root.publicKey));
    expect(openRootGrant(other, annaId, company, grant)).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });

  it("refuses a key the server wrapped itself: it is not the pinned root", () => {
    const mallory = ed25519KeyPair(new Uint8Array(32).fill(0x66));
    const forged = grantRoot(mallory.secretKey, { ...annaMember, role: "admin" });
    expect(openRootGrant(annaBlock, annaId, company, forged)).toEqual({
      ok: false,
      error: "other-root",
    });
  });

  it("refuses a wrapped payload that is no 32-byte key", () => {
    const to = {
      publicKey: annaBlock.xwing.publicKey,
      fingerprint: bundleFingerprint(annaBlock.xwing.publicKey, annaBlock.ed.publicKey),
    };
    const short = wrap(to, new Uint8Array(31), { purpose: "root-key", context: [company, annaId] });
    expect(openRootGrant(annaBlock, annaId, company, short)).toEqual({
      ok: false,
      error: "not-authentic",
    });
    // The same wrap with 32 bytes opens: only the length was wrong
    const right = wrap(to, root.secretKey, { purpose: "root-key", context: [company, annaId] });
    expect(openRootGrant(annaBlock, annaId, company, right).ok).toBe(true);
  });
});
