/**
 * Certificates of docs/sicherheitsdesign.md (F-06, P-07): the company root key signs an employee's
 * key bundle, so a client takes public keys only from a certificate it has checked, never raw from
 * the server (E-05, E-10).
 *
 *   bundle      = enc("kennwort/bundle/v1", account, xwingPk, edPk)
 *   certificate = enc(bundle, company, role, issuedAt) ‖ F-03(root, "certificate", …)
 */
import { bundleFingerprint, encode, sign, verify } from "@kennwort/crypto";

export type CompanyRole = "owner" | "admin" | "member";

export type Certificate = {
  accountId: Uint8Array;
  xwingPublicKey: Uint8Array;
  edPublicKey: Uint8Array;
  companyId: Uint8Array;
  role: CompanyRole;
  issuedAt: number;
  signature: Uint8Array;
};

export type Unsigned = Omit<Certificate, "signature">;

const bundle = (c: Unsigned) =>
  encode("kennwort/bundle/v1", c.accountId, c.xwingPublicKey, c.edPublicKey);
const fields = (c: Unsigned) => [bundle(c), c.companyId, c.role, c.issuedAt] as const;

export const certify = (rootSecretKey: Uint8Array, unsigned: Unsigned): Certificate => ({
  ...unsigned,
  signature: sign(rootSecretKey, "certificate", ...fields(unsigned)),
});

export const isCertified = (rootPublicKey: Uint8Array, certificate: Certificate): boolean =>
  verify(rootPublicKey, certificate.signature, "certificate", ...fields(certificate));

export const certificateFingerprint = (certificate: Certificate) =>
  bundleFingerprint(certificate.xwingPublicKey, certificate.edPublicKey);
