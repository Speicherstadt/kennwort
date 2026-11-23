/**
 * Which Kennwort release is the newest (K-703, docs/plan.md "Update-Hinweis"): one plain GET to a
 * fixed https address of GitHub's REST API, no cookie, no token, nothing about this server but
 * what any request shows (its address) and a User-Agent GitHub requires. No redirect is followed,
 * so the answer comes from api.github.com or not at all, the way the leak check asks its service
 * (pwned/upstream.ts). Only `tag_name` is read, and only as vX.Y.Z; anything else is no answer.
 * GitHub's /releases/latest leaves out drafts and pre-releases.
 */
import { z } from "zod";
import { textUpTo } from "../pwned/upstream.ts";

export const RELEASES_URL = "https://api.github.com/repos/Speicherstadt/kennwort/releases/latest";
/** A release answer is a few KiB, its notes included; anything far beyond is no answer */
export const MAX_RELEASE_LENGTH = 256 * 1024;
export const RELEASE_TIMEOUT_MS = 10_000;

export type Version = readonly [number, number, number];

const VERSION = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/;

/** X.Y.Z, with or without the v of a tag; undefined for anything else, pre-releases included */
export const parseVersion = (text: string): Version | undefined => {
  const match = VERSION.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
};

export const isNewer = (candidate: Version, current: Version) => {
  for (const index of [0, 1, 2] as const)
    if (candidate[index] !== current[index]) return candidate[index] > current[index];
  return false;
};

export const formatVersion = (version: Version) => version.join(".");

const Release = z.object({ tag_name: z.string().max(64) });

/** The newest release's version, or undefined when GitHub gives no usable answer */
export const latestRelease = async (fetch: typeof globalThis.fetch) => {
  const response = await fetch(RELEASES_URL, {
    method: "GET",
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Kennwort" },
    redirect: "error",
    signal: AbortSignal.timeout(RELEASE_TIMEOUT_MS),
  }).catch(() => undefined);
  if (!response?.ok) return undefined;
  const text = await textUpTo(response, MAX_RELEASE_LENGTH).catch(() => undefined);
  if (text === undefined) return undefined;
  try {
    const release = Release.safeParse(JSON.parse(text));
    return release.success ? parseVersion(release.data.tag_name) : undefined;
  } catch {
    return undefined;
  }
};
