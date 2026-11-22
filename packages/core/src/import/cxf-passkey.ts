/**
 * A passkey from a Credential Exchange Format file (CXF v1.0 §3.3.3, `passkey`) as a Kennwort
 * passkey entry (F-12, webauthn/passkey-entry.ts). CXF carries the private key as PKCS#8 (RFC 5958)
 * in ASN.1 DER, base64url; Kennwort keeps ES256 keys only, so only a P-256 key (RFC 5480
 * `id-ecPublicKey` with `secp256r1`, the scalar as RFC 5915's `ECPrivateKey`) becomes an entry.
 * Every other key – Ed25519, P-384, RSA – and every key that does not hold together is left out
 * and counted. Where the key names its public key, it must be the one the scalar gives.
 */
import { passkeyPublicKey } from "@kennwort/crypto";
import { z } from "zod";
import { bytes } from "../sync/bytes.ts";
import { MAX_USER_HANDLE, passkeyContent } from "../webauthn/passkey-entry.ts";
import { cleanList, cleanTags } from "./entry.ts";
import { text } from "./schema.ts";
import type { ImportedEntry } from "./types.ts";

type Element = { tag: number; body: Uint8Array; end: number };

const SEQUENCE = 0x30;
const OCTET_STRING = 0x04;
/** ECPrivateKey's `[1] publicKey` */
const PUBLIC_KEY = 0xa1;
/** 1.2.840.10045.2.1 id-ecPublicKey, then 1.2.840.10045.3.1.7 secp256r1, each as a DER OID */
const P256_ALGORITHM = "06072a8648ce3d020106082a8648ce3d030107";
const F12_VERSION = 0x01;

const hex = (data: Uint8Array) => Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * One DER element at `at`; lengths in the short form or in one byte after 0x81, which is all a
 * P-256 key needs, so any longer length is not one
 */
const element = (data: Uint8Array, at: number): Element | undefined => {
  const long = data[at + 1] === 0x81;
  const start = at + (long ? 3 : 2);
  // Past the end there is no length; `end` then lies past the end as well
  const length = data[start - 1] ?? 0;
  if (!long && length >= 0x80) return undefined;
  const end = start + length;
  if (end > data.length) return undefined;
  return { tag: data[at] as number, body: data.subarray(start, end), end };
};

/** The elements that fill these bytes one after another, or undefined */
const elements = (data: Uint8Array): Element[] | undefined => {
  const found: Element[] = [];
  for (let at = 0; at < data.length; ) {
    const next = element(data, at);
    if (!next) return undefined;
    found.push(next);
    at = next.end;
  }
  return found;
};

/** The elements inside an element with this tag; nothing for any other */
const inside = (outer: Element | undefined, tag: number): Element[] =>
  (outer?.tag === tag && elements(outer.body)) || [];

/** The public key an ECPrivateKey names, as hex of the element inside its `[1]` with its tag */
const namedPublicKey = (tail: Element[]): string | undefined => {
  const [bits] = inside(
    tail.find((e) => e.tag === PUBLIC_KEY),
    PUBLIC_KEY,
  );
  return bits && hex(Uint8Array.of(bits.tag, ...bits.body));
};

/** The F-12 key (0x01 ‖ d) of a PKCS#8 P-256 key, or undefined for any other key */
export const es256Key = (pkcs8: Uint8Array): Uint8Array | undefined => {
  const all = elements(pkcs8);
  if (all?.length !== 1) return undefined;
  const [, algorithm, privateKey] = inside(all[0], SEQUENCE);
  if (algorithm?.tag !== SEQUENCE || hex(algorithm.body) !== P256_ALGORITHM) return undefined;
  const [, scalar, ...tail] = inside(inside(privateKey, OCTET_STRING)[0], SEQUENCE);
  // passkeyPublicKey refuses a scalar of any length but 32 bytes, or out of range
  if (scalar?.tag !== OCTET_STRING) return undefined;
  const key = Uint8Array.of(F12_VERSION, ...scalar.body);
  const publicKey = passkeyPublicKey(key);
  if (!publicKey.ok) return undefined;
  const named = namedPublicKey(tail);
  // A BIT STRING without unused bits around the uncompressed point
  if (named !== undefined && named !== `0300${hex(publicKey.value)}`) return undefined;
  return key;
};

/** base64url with or without padding, as CXF allows; anything else is no bytes */
const fromBase64Url = (value: string) => bytes().safeParse(value.replace(/=+$/, "")).data;

/**
 * The rpId as the extension compares it with the page's (apps/extension/src/passkey/rp-id.ts): a
 * host alone, in lower case and punycode; undefined for anything with a scheme, port, path or user
 */
const rpHost = (rpId: string): string | undefined => {
  const url = `https://${rpId}`;
  if (/[\s:/?#@\\]/.test(rpId) || !URL.canParse(url)) return undefined;
  return new URL(url).hostname;
};

const CxfPasskey = z.object({
  credentialId: text,
  rpId: text,
  username: text,
  userDisplayName: text,
  userHandle: text,
  key: text,
});

/** What a passkey entry takes from its CXF item */
export type ItemContext = {
  title: string;
  favorite: boolean;
  tags: string[];
  folders: string[];
};

/** The passkey entry of a CXF `passkey` credential, or undefined for one Kennwort cannot keep */
export const passkeyEntry = (credential: unknown, item: ItemContext): ImportedEntry | undefined => {
  const parsed = CxfPasskey.safeParse(credential);
  if (!parsed.success) return undefined;
  const passkey = parsed.data;
  const credentialId = fromBase64Url(passkey.credentialId);
  const userHandle = fromBase64Url(passkey.userHandle);
  const pkcs8 = fromBase64Url(passkey.key);
  const key = pkcs8 && es256Key(pkcs8);
  const rpId = rpHost(passkey.rpId.trim());
  // WebAuthn Level 3 §5.1.3: a user handle is 1 to 64 bytes
  if (!rpId || !key || !credentialId?.length || !userHandle?.length) return undefined;
  if (userHandle.length > MAX_USER_HANDLE) return undefined;
  const content = passkeyContent({
    rpId,
    rpName: item.title,
    username: passkey.username,
    displayName: passkey.userDisplayName,
    userHandle,
    credentialId,
    key,
  });
  return {
    content: { ...content, favorite: item.favorite, tags: cleanTags(item.tags) },
    folders: cleanList(item.folders),
  };
};

/** An SSH key's PKCS#8 bytes (CXF `ssh-key`) as the PEM text SSH tools read */
export const pemOf = (base64url: string): string => {
  const der = fromBase64Url(base64url);
  if (!der?.length) return base64url;
  const base64 = btoa(String.fromCharCode(...der));
  const lines = Array.from({ length: Math.ceil(base64.length / 64) }, (_, i) =>
    base64.slice(i * 64, (i + 1) * 64),
  );
  return ["-----BEGIN PRIVATE KEY-----", ...lines, "-----END PRIVATE KEY-----"].join("\n");
};
