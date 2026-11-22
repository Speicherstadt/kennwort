/**
 * What an authenticator hands a relying party (WebAuthn Level 3, §6.1 and §6.5), as Kennwort writes
 * it for its passkeys (K-406, F-12): the authenticator data, the COSE key of an ES256 credential,
 * the attestation object of attestation "none" (§8.7) and the client data a browser would write
 * (§5.8.1.1). The extension's prompt fills in what the service worker read from the browser's frame
 * tree (origin) and checked (rpId); a page never sets either.
 */
import { ES256, sha256 } from "@kennwort/crypto";
import { cbor } from "./cbor.ts";

/** The flags of §6.1: user present and verified, backup eligible and backed up (synced), attested */
export const FLAGS = { up: 0x01, uv: 0x04, be: 0x08, bs: 0x10, at: 0x40 } as const;

/**
 * Every assertion: the user clicked (UP) in an unlocked Kennwort (UV), and the credential is synced
 * to every device of the account (BE, BS), like the passkeys of Apple, Google and Bitwarden
 */
export const ASSERTION_FLAGS = FLAGS.up | FLAGS.uv | FLAGS.be | FLAGS.bs;
export const REGISTRATION_FLAGS = ASSERTION_FLAGS | FLAGS.at;

/**
 * All zero, as WebAuthn §6.5.1 allows for attestation "none" and browsers send for it: a relying
 * party learns nothing about which password manager holds the passkey
 */
export const AAGUID = new Uint8Array(16);

const utf8 = new TextEncoder();
/** The fixed head of a P-256 SubjectPublicKeyInfo (RFC 5480), before the uncompressed point */
const SPKI_P256 = Uint8Array.from([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
  0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);
const POINT_LENGTH = 65;

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const checkPoint = (point: Uint8Array) => {
  if (point.length !== POINT_LENGTH || point[0] !== 0x04)
    throw new RangeError("expected an uncompressed P-256 point");
};

/** The COSE_Key of an ES256 public key (RFC 9053, §7.1.1), keys in CTAP2's canonical order */
export const coseKey = (point: Uint8Array): Uint8Array => {
  checkPoint(point);
  return cbor([
    [1, 2], // kty: EC2
    [3, ES256], // alg
    [-1, 1], // crv: P-256
    [-2, point.slice(1, 33)], // x
    [-3, point.slice(33)], // y
  ]);
};

/** The SubjectPublicKeyInfo of the key (WebAuthn §5.2.1.1, getPublicKey()) */
export const spkiKey = (point: Uint8Array): Uint8Array => {
  checkPoint(point);
  return concat(SPKI_P256, point);
};

/** The credential a registration attests: its ID and its public key */
export type Attested = { credentialId: Uint8Array; publicKey: Uint8Array };

/** The authenticator data (§6.1): SHA-256 of the rpId, flags, counter and, for a registration, the credential */
export const authenticatorData = (
  rpId: string,
  flags: number,
  counter: number,
  attested?: Attested,
): Uint8Array => {
  if (!Number.isInteger(counter) || counter < 0 || counter > 0xffff_ffff)
    throw new RangeError("counter out of range");
  const fixed = new Uint8Array(37);
  fixed.set(sha256(utf8.encode(rpId)));
  fixed[32] = flags;
  new DataView(fixed.buffer).setUint32(33, counter);
  if (!attested) return fixed;
  const { credentialId, publicKey } = attested;
  if (credentialId.length === 0 || credentialId.length > 1023)
    throw new RangeError("credential ID length out of range");
  const length = Uint8Array.of(credentialId.length >> 8, credentialId.length & 0xff);
  return concat(fixed, AAGUID, length, credentialId, coseKey(publicKey));
};

/** The attestation object of attestation "none" (§8.7): no statement, only the authenticator data */
export const attestationObject = (authData: Uint8Array): Uint8Array =>
  cbor([
    ["fmt", "none"],
    ["attStmt", []],
    ["authData", authData],
  ]);

export type ClientData = {
  type: "webauthn.create" | "webauthn.get";
  /** The relying party's challenge as base64url, as the browser writes it */
  challenge: string;
  origin: string;
};

/**
 * The client data JSON (§5.8.1.1) in the order and form a browser writes it; never from a cross-origin
 * frame, which the extension leaves to the browser, so crossOrigin is always false
 */
export const clientDataJSON = (data: ClientData): Uint8Array =>
  utf8.encode(
    JSON.stringify({
      type: data.type,
      challenge: data.challenge,
      origin: data.origin,
      crossOrigin: false,
    }),
  );

/** What the credential's key signs for an assertion (§6.3.3, step 11): authData ‖ SHA-256(clientDataJSON) */
export const signedMessage = (authData: Uint8Array, clientData: Uint8Array): Uint8Array =>
  concat(authData, sha256(clientData));
