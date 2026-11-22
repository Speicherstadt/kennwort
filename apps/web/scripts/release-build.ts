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

export type Sequence = { sequence: number; source: "SOURCE_DATE_EPOCH" | "commit" | "clock" };

/** Whole seconds since 1970, as SOURCE_DATE_EPOCH and `git log --format=%ct` write them */
const secondsIn = (text: string | undefined): number | undefined => {
  const trimmed = text?.trim() ?? "";
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(Number(trimmed))
    ? Number(trimmed)
    : undefined;
};

/**
 * The release's place in the order of releases, in seconds: SOURCE_DATE_EPOCH, else the time of the
 * last commit (`commit`, the output of `git log -1 --format=%ct`), else the build's own time. The
 * commit's time makes two builds of the same commit sign the same release.json (K-408, reproducible
 * builds); releases come from successive commits on main, so it still grows with every release.
 */
export const sequenceOf = (
  env: Env,
  { commit, nowMs }: { commit: string | undefined; nowMs: number },
): Sequence => {
  const given = secondsIn(env.SOURCE_DATE_EPOCH);
  if (given !== undefined) return { sequence: given, source: "SOURCE_DATE_EPOCH" };
  const committed = secondsIn(commit);
  if (committed !== undefined) return { sequence: committed, source: "commit" };
  return { sequence: Math.floor(nowMs / 1000), source: "clock" };
};

/** The path a browser asks for, from a path relative to the build's folder */
export const browserPath = (relative: string) => `/${relative.split(/[\\/]/).join("/")}`;

/** Every file of the build but the manifest, its signature and the worker */
export const listedPaths = (relatives: string[]): string[] =>
  relatives.map(browserPath).filter((path) => !UNLISTED.includes(path));
