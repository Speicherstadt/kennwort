/**
 * What the build needs to sign a release (P-16): the release key, the order of releases and the
 * files a manifest lists. Pure; build-worker.ts and sign-release.ts do the reading and writing.
 */
import { ed25519KeyPair } from "@kennwort/crypto";
import { fromHex, toHex, UNLISTED } from "../src/sw/release.ts";

/**
 * The agent loop's test key, never the key of a published release: its seed is in this public
 * repository, so anyone can sign with it. A person creates the real release key for publication
 * (docs/plan.md, steps only a person can do) and passes it as KENNWORT_RELEASE_KEY; the build of
 * the published worker gets its public key as KENNWORT_RELEASE_PUBLIC_KEY.
 */
export const TEST_RELEASE_SEED = toHex(
  new TextEncoder().encode("kennwort release test key (loop)"),
);

export type Env = Record<string, string | undefined>;
export type ReleaseKeys = { secretKey: Uint8Array; publicKey: Uint8Array; isTestKey: boolean };
type Keys<T> = { ok: true; value: T } | { ok: false; error: string };

const keyFrom = (name: string, hex: string): Keys<Uint8Array> => {
  const bytes = fromHex(hex.trim().toLowerCase());
  return bytes?.length === 32
    ? { ok: true, value: bytes }
    : { ok: false, error: `${name} must be 32 bytes as hex` };
};

/** The key that signs: KENNWORT_RELEASE_KEY (an Ed25519 seed as hex), else the test key */
export const signingKeys = (env: Env): Keys<ReleaseKeys> => {
  const given = env.KENNWORT_RELEASE_KEY;
  const seed = keyFrom("KENNWORT_RELEASE_KEY", given ?? TEST_RELEASE_SEED);
  if (!seed.ok) return seed;
  const { secretKey, publicKey } = ed25519KeyPair(seed.value);
  return { ok: true, value: { secretKey, publicKey, isTestKey: given === undefined } };
};

/** The key the worker trusts: KENNWORT_RELEASE_PUBLIC_KEY, else the public half of the signing key */
export const trustedKey = (env: Env): Keys<Uint8Array> => {
  const given = env.KENNWORT_RELEASE_PUBLIC_KEY;
  if (given !== undefined) return keyFrom("KENNWORT_RELEASE_PUBLIC_KEY", given);
  const keys = signingKeys(env);
  return keys.ok ? { ok: true, value: keys.value.publicKey } : keys;
};

/**
 * The release's place in the order of releases: SOURCE_DATE_EPOCH, as reproducible builds set it
 * to the time of the last commit, else the build's own time; both in seconds
 */
export const sequenceOf = (env: Env, nowMs: number): number => {
  const given = Number(env.SOURCE_DATE_EPOCH);
  return env.SOURCE_DATE_EPOCH && Number.isSafeInteger(given) && given >= 0
    ? given
    : Math.floor(nowMs / 1000);
};

/** The path a browser asks for, from a path relative to the build's folder */
export const browserPath = (relative: string) => `/${relative.split(/[\\/]/).join("/")}`;

/** Every file of the build but the manifest, its signature and the worker */
export const listedPaths = (relatives: string[]): string[] =>
  relatives.map(browserPath).filter((path) => !UNLISTED.includes(path));
