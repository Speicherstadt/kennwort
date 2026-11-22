// Emergency access at Weber Haustechnik for the tests (K-307 part d, P-14): Jonas names Sandra, who
// is no member of Büro, for view access to Büro, or for full access to his account
import { type KeyBlock, rootFingerprint, sealKeyBlock } from "@kennwort/crypto";
import { certificateFingerprint } from "../../membership/certificate.ts";
import { type GrantKeys, makeGrant, signStatement } from "../../membership/emergency.ts";
import {
  certificate,
  jonas,
  type Person,
  root,
  sandra,
  trust,
  vaultId,
  vaultKey,
} from "./fixtures.ts";

export const DAY = 86_400;
export const GRANTED_AT = 1_800_000_050;
export const ring = { vaultId, epoch: 0, vaultKey };
export const jonasAuthor = { id: jonas.id, edSecretKey: jonas.ed.secretKey };
export const jonasAccountKey = new Uint8Array(32).fill(0x77);
export const blockOf = (p: Person): KeyBlock => ({
  xwing: p.xwing,
  ed: p.ed,
  rootFingerprint: rootFingerprint(root.publicKey),
});
export const jonasSealedBlock = sealKeyBlock(jonasAccountKey, jonas.id, blockOf(jonas));

export const grantTo = (
  grantee: Person = sandra,
  keys: GrantKeys = { scope: "view", rings: [ring] },
  { waitSeconds = 7 * DAY, time = GRANTED_AT } = {},
) => makeGrant(jonasAuthor, certificate(grantee), keys, { waitSeconds, time });

export const fullGrant = (time = GRANTED_AT) =>
  grantTo(sandra, { scope: "full", accountKey: jonasAccountKey }, { time });

/** Sandra's own keys as a reader of packages */
export const sandraReader = {
  secretKey: sandra.xwing.secretKey,
  fingerprint: certificateFingerprint(certificate(sandra)),
};

export const requestBy = (p: Person, grant: Parameters<typeof signStatement>[2], at: number) =>
  signStatement("emergency-request", p.ed.secretKey, grant, at);

export const parties = { grantor: certificate(jonas), me: certificate(sandra) };
export { certificate, jonas, sandra, trust };
