// Weber Haustechnik after Anna renewed her keys (P-12): her old bundle in the history, the new one
// certified later; the sync fixtures' vault "Büro" as it stood before
import { ed25519KeyPair, xwingKeyPair } from "@kennwort/crypto";
import { anna, certificate, type Person, root, trust } from "../../sync/test/fixtures.ts";
import { certify } from "../certificate.ts";
import { idKey, type Trust } from "../verify-log.ts";

export const RENEWED_AT = 1_800_001_000;

/** Anna's new keys: the same account, another bundle */
export const annaNew: Person = {
  id: anna.id,
  ed: ed25519KeyPair(new Uint8Array(32).fill(0x21)),
  xwing: xwingKeyPair(new Uint8Array(32).fill(0x21)),
};

export const renewedCertificate = certify(root.secretKey, {
  accountId: annaNew.id,
  xwingPublicKey: annaNew.xwing.publicKey,
  edPublicKey: annaNew.ed.publicKey,
  companyId: certificate(anna).companyId,
  role: "member",
  issuedAt: RENEWED_AT,
});

/** The new bundle certified, the old one in the history; the clock after the renewal */
export const renewedTrust = (now = RENEWED_AT + 1000): Trust => ({
  ...trust,
  certificates: new Map([...trust.certificates, [idKey(anna.id), renewedCertificate]]),
  history: new Map([[idKey(anna.id), [certificate(anna)]]]),
  now,
});

/** Renewed, but the server withholds the new certificate (or no admin has given it yet) */
export const withheldTrust = (now = RENEWED_AT + 1000): Trust => {
  const certificates = new Map(trust.certificates);
  certificates.delete(idKey(anna.id));
  return { ...renewedTrust(now), certificates };
};
