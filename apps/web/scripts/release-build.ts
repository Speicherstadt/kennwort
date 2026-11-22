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
 * The sequence of the last of these commits, from their committer times oldest first: each commit
 * gets its own time, but at least one more than the commit before. Committer time alone can stand
 * still or go backwards from one commit to the next (two commits in one second, a clock behind, a
 * fast-forward of a commit made earlier); the worker would then never take the newer release, or a
 * worker installed fresh on it would take the older one as an update (P-16 rollback protection).
 */
export const sequenceAlong = (times: readonly number[]): number | undefined =>
  times.reduce<number | undefined>(
    (before, time) => (before === undefined ? time : Math.max(time, before + 1)),
    undefined,
  );

/** The output of `git log --first-parent --reverse --format=%ct`, one time per line */
const historyIn = (text: string | undefined): number[] | undefined => {
  const times = (text ?? "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map(secondsIn);
  return times.length > 0 && times.every((time): time is number => time !== undefined)
    ? times
    : undefined;
};

/**
 * The release's place in the order of releases, in seconds: SOURCE_DATE_EPOCH, else from the first-
 * parent history up to the last commit (`history`, the output of `git log --first-parent --reverse
 * --format=%ct`, see sequenceAlong), else the build's own time. The history makes two builds of the
 * same commit sign the same release.json (K-408, reproducible builds) and the number grow with every
 * commit on main, whatever its committer time says.
 */
export const sequenceOf = (
  env: Env,
  { history, nowMs }: { history: string | undefined; nowMs: number },
): Sequence => {
  const given = secondsIn(env.SOURCE_DATE_EPOCH);
  if (given !== undefined) return { sequence: given, source: "SOURCE_DATE_EPOCH" };
  const times = historyIn(history);
  const committed = times && sequenceAlong(times);
  if (committed !== undefined && Number.isSafeInteger(committed))
    return { sequence: committed, source: "commit" };
  return { sequence: Math.floor(nowMs / 1000), source: "clock" };
};

/** The path a browser asks for, from a path relative to the build's folder */
export const browserPath = (relative: string) => `/${relative.split(/[\\/]/).join("/")}`;

/** Every file of the build but the manifest, its signature and the worker */
export const listedPaths = (relatives: string[]): string[] =>
  relatives.map(browserPath).filter((path) => !UNLISTED.includes(path));
