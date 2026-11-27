/**
 * Checks an ID token (OpenID Connect Core 1.0, §3.1.3.7; RFC 7515, RFC 7518): the signature with a
 * key of the provider's JWKS, only with an algorithm on the allowlist (never `none`, never HMAC,
 * whose secret would be the public key: alg confusion), then issuer, audience, authorized party,
 * expiry, issue time and nonce. WebCrypto verifies; nothing here is a primitive of its own.
 * What comes out names a person only: the identity provider never sees or hands out a key (P-02).
 */
import { z } from "zod";

/** Allowed algorithms with the key type each needs and how WebCrypto verifies it */
const ALGORITHMS = {
  RS256: {
    kty: "RSA",
    importAs: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    verifyAs: { name: "RSASSA-PKCS1-v1_5" },
  },
  PS256: {
    kty: "RSA",
    importAs: { name: "RSA-PSS", hash: "SHA-256" },
    verifyAs: { name: "RSA-PSS", saltLength: 32 },
  },
  ES256: {
    kty: "EC",
    importAs: { name: "ECDSA", namedCurve: "P-256" },
    verifyAs: { name: "ECDSA", hash: "SHA-256" },
  },
  EdDSA: { kty: "OKP", importAs: { name: "Ed25519" }, verifyAs: { name: "Ed25519" } },
} as const;
export type Algorithm = keyof typeof ALGORITHMS;
export const ALLOWED_ALGORITHMS = Object.keys(ALGORITHMS) as Algorithm[];

/** Seconds a clock may be off between provider and server */
export const CLOCK_SKEW_SECONDS = 60;
/** An ID token issued longer ago than this is refused, even if the provider lets it live longer */
export const MAX_AGE_SECONDS = 10 * 60;

const Jwk = z
  .object({
    kty: z.string(),
    kid: z.string().optional(),
    alg: z.string().optional(),
    use: z.string().optional(),
    crv: z.string().optional(),
  })
  .passthrough();
export type Jwk = z.infer<typeof Jwk>;
export const Jwks = z.object({ keys: z.array(Jwk).max(100) });
export type Jwks = z.infer<typeof Jwks>;

const Header = z.object({
  alg: z.string(),
  kid: z.string().optional(),
  crit: z.unknown().optional(),
});

const Claims = z.object({
  iss: z.string(),
  sub: z.string().min(1).max(255),
  aud: z.union([z.string(), z.array(z.string()).min(1)]),
  azp: z.string().optional(),
  exp: z.number(),
  iat: z.number(),
  nonce: z.string().optional(),
  name: z.string().max(200).optional(),
  preferred_username: z.string().max(200).optional(),
});

export type IdTokenError =
  | "malformed"
  | "algorithm"
  | "unknown-key"
  | "signature"
  | "issuer"
  | "audience"
  | "expired"
  | "issued-at"
  | "nonce";

export type IdToken = {
  issuer: string;
  subject: string;
  /** What the provider calls the person, a label only (like an invitation's), never trusted */
  name: string | undefined;
  /** Every claim from the verified ID token payload */
  claims: Record<string, unknown>;
};

export type Expected = {
  issuer: string;
  clientId: string;
  nonce: string;
  /** Seconds since the epoch */
  now: number;
};

type Checked = { ok: true; value: IdToken } | { ok: false; error: IdTokenError };

const fromBase64Url = (text: string) => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return undefined;
  return new Uint8Array(Buffer.from(text, "base64url")) as Uint8Array<ArrayBuffer>;
};

const parseJson = (part: string): unknown => {
  const raw = fromBase64Url(part);
  if (!raw) return undefined;
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return undefined;
  }
};

const isAlgorithm = (alg: string): alg is Algorithm => Object.hasOwn(ALGORITHMS, alg);

/** The one key that fits: by `kid`, else the only key of the right type; never a key for another use */
export const keyFor = (jwks: Jwks, alg: Algorithm, kid: string | undefined) => {
  const usable = jwks.keys.filter(
    (key) =>
      key.kty === ALGORITHMS[alg].kty &&
      (key.use === undefined || key.use === "sig") &&
      (key.alg === undefined || key.alg === alg) &&
      (alg !== "EdDSA" || key.crv === "Ed25519") &&
      (alg !== "ES256" || key.crv === "P-256"),
  );
  if (kid !== undefined) return usable.find((key) => key.kid === kid);
  return usable.length === 1 ? usable[0] : undefined;
};

const verifySignature = async (
  alg: Algorithm,
  jwk: Jwk,
  signed: string,
  signature: Uint8Array<ArrayBuffer>,
) => {
  const { kid: _kid, alg: _alg, use: _use, key_ops: _ops, ...material } = jwk;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      material as JsonWebKey,
      ALGORITHMS[alg].importAs,
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      ALGORITHMS[alg].verifyAs,
      key,
      signature,
      new TextEncoder().encode(signed),
    );
  } catch {
    return false;
  }
};

/** §3.1.3.7 steps 2 to 11, after the signature: who issued it, for whom, when and for which login */
const checkClaims = (
  claims: z.infer<typeof Claims>,
  expected: Expected,
): IdTokenError | undefined => {
  if (claims.iss !== expected.issuer) return "issuer";
  const audiences = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
  if (!audiences.includes(expected.clientId)) return "audience";
  // With more than one audience the token must say it was issued to this client
  if ((audiences.length > 1 || claims.azp !== undefined) && claims.azp !== expected.clientId)
    return "audience";
  if (claims.exp <= expected.now - CLOCK_SKEW_SECONDS) return "expired";
  if (claims.iat > expected.now + CLOCK_SKEW_SECONDS) return "issued-at";
  if (claims.iat < expected.now - MAX_AGE_SECONDS) return "issued-at";
  if (claims.nonce === undefined || claims.nonce !== expected.nonce) return "nonce";
  return undefined;
};

/**
 * The checked ID token, or why not. `keys` gives the provider's JWKS; asked again with `fresh` once
 * when no key fits, so a provider that rotated its keys still signs people in.
 */
export const verifyIdToken = async (
  token: string,
  keys: (fresh: boolean) => Promise<Jwks | undefined>,
  expected: Expected,
): Promise<Checked> => {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed" };
  const [headerPart = "", claimsPart = "", signaturePart = ""] = parts;
  const header = Header.safeParse(parseJson(headerPart));
  const claims = Claims.safeParse(parseJson(claimsPart));
  const signature = fromBase64Url(signaturePart);
  if (!header.success || !claims.success || !signature) return { ok: false, error: "malformed" };
  // A critical extension this client does not know means the token must not be accepted (RFC 7515)
  if (!isAlgorithm(header.data.alg) || header.data.crit !== undefined)
    return { ok: false, error: "algorithm" };
  const alg = header.data.alg;
  const key =
    keyFor((await keys(false)) ?? { keys: [] }, alg, header.data.kid) ??
    keyFor((await keys(true)) ?? { keys: [] }, alg, header.data.kid);
  if (!key) return { ok: false, error: "unknown-key" };
  if (!(await verifySignature(alg, key, `${headerPart}.${claimsPart}`, signature)))
    return { ok: false, error: "signature" };
  const problem = checkClaims(claims.data, expected);
  if (problem) return { ok: false, error: problem };
  const all = parseJson(claimsPart) as Record<string, unknown>;
  return {
    ok: true,
    value: {
      issuer: claims.data.iss,
      subject: claims.data.sub,
      name: claims.data.name ?? claims.data.preferred_username,
      claims: all,
    },
  };
};
