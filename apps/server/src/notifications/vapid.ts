/**
 * The server's VAPID key (RFC 8292) for Web Push: a P-256 key pair made on the first need and kept
 * in the database, and the ES256 JWT that tells a push service which server sends. WebCrypto
 * signs; its ECDSA output is r‖s, the form JWS asks for (RFC 7518 3.4), so no package is needed.
 * The key only identifies the sender to the push services; it opens nothing.
 */
import { encodeBytes } from "@kennwort/core";
import { eq } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { serverKeys } from "../db/schema.ts";

export type Vapid = { publicKey: Uint8Array; privateKey: CryptoKey };

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const KEY_NAME = "vapid";
/** RFC 8292 section 2: at most 24 hours; 12 leaves room for a push service's clock */
const JWT_SECONDS = 12 * 60 * 60;

const text = new TextEncoder();
const base64url = (value: string | Uint8Array) =>
  encodeBytes(typeof value === "string" ? text.encode(value) : value);

/** The private key as JWK, the form the database keeps; d, x and y in base64url */
export type VapidJwk = { kty: "EC"; crv: "P-256"; d: string; x: string; y: string };

export const importVapid = async (jwk: VapidJwk): Promise<Vapid> => {
  const privateKey = await crypto.subtle.importKey("jwk", jwk, ALGORITHM, false, ["sign"]);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    ALGORITHM,
    true,
    ["verify"],
  );
  return { privateKey, publicKey: new Uint8Array(await crypto.subtle.exportKey("raw", publicKey)) };
};

export const generateVapidJwk = async (): Promise<VapidJwk> => {
  const pair = await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"]);
  const { d, x, y } = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!d || !x || !y) throw new Error("P-256 key without its parts"); // i18n-ignore: for developers
  return { kty: "EC", crv: "P-256", d, x, y };
};

/**
 * The installation's key: the one stored, or a new one stored first. Of two starts at once only
 * one insert wins, and both read that one back.
 */
export const loadVapid = async (db: Db, now: number, make = generateVapidJwk): Promise<Vapid> => {
  const read = () => db.select().from(serverKeys).where(eq(serverKeys.name, KEY_NAME)).get();
  const stored = read();
  if (stored) return importVapid(JSON.parse(stored.value) as VapidJwk);
  const value = JSON.stringify(await make());
  db.insert(serverKeys)
    .values({ name: KEY_NAME, value, createdAt: now })
    .onConflictDoNothing()
    .run();
  return importVapid(JSON.parse(read()?.value ?? value) as VapidJwk);
};

/** The JWT for one push service (RFC 8292 section 2): its origin, a near expiry and who sends */
export const vapidJwt = async (vapid: Vapid, audience: string, subject: string, now: number) => {
  const header = base64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = { aud: audience, exp: Math.floor(now / 1000) + JWT_SECONDS, sub: subject };
  const signed = `${header}.${base64url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    vapid.privateKey,
    text.encode(signed),
  );
  return `${signed}.${base64url(new Uint8Array(signature))}`;
};

/** The Authorization header for a push to this address (RFC 8292 section 3) */
export const vapidAuthorization = async (
  vapid: Vapid,
  endpoint: string,
  subject: string,
  now: number,
) =>
  `vapid t=${await vapidJwt(vapid, new URL(endpoint).origin, subject, now)}, k=${base64url(vapid.publicKey)}`;
