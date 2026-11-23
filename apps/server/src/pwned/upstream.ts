/**
 * Where the server gets a range of Pwned Passwords from (K-603, docs/sicherheitsdesign.md P-23):
 * the service the operator configured (KENNWORT_PWNED_URL, by default
 * https://api.pwnedpasswords.com/range/), asked with only the five-character prefix and with
 * `Add-Padding: true`, so every answer has about the same size. A range is kept in memory for an
 * hour, never on a disk: the same prefix asked by several people goes out once. Whatever the
 * service sends must read as a range (packages/core, parseRange), else it counts as no answer.
 */
import { isRangePrefix, parseRange } from "@kennwort/core";

/** The range of a prefix as the service wrote it, padding included; undefined: none */
export type RangeSource = (prefix: string) => Promise<string | undefined>;

export const RANGE_TTL_MS = 60 * 60 * 1000;
/** Ranges kept at most; about 30 KiB each with padding, so at most some 300 MiB */
export const MAX_CACHED_RANGES = 10_000;
/** A padded range is some 30 KiB; anything far beyond is no range */
export const MAX_RANGE_LENGTH = 1 << 20;
export const RANGE_TIMEOUT_MS = 10_000;

export type UpstreamDeps = {
  /** The service's range address up to the prefix, ending in "/" */
  url: string;
  fetch: typeof fetch;
  now: () => number;
};

/**
 * The body as text, read only up to `limit` bytes: a longer one is no range, and reading on would
 * hold whatever an endless answer sends in memory (review of K-603); undefined then
 */
export const textUpTo = async (response: Response, limit: number) => {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    length += value.length;
    if (length > limit) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    text += decoder.decode(value, { stream: true });
  }
};

const ask = async ({ url, fetch }: UpstreamDeps, prefix: string) => {
  const response = await fetch(`${url}${prefix}`, {
    headers: { "Add-Padding": "true", "User-Agent": "Kennwort" },
    redirect: "error",
    signal: AbortSignal.timeout(RANGE_TIMEOUT_MS),
  }).catch(() => undefined);
  if (!response?.ok) return undefined;
  const text = await textUpTo(response, MAX_RANGE_LENGTH).catch(() => undefined);
  return text !== undefined && parseRange(text).ok ? text : undefined;
};

export const upstreamRanges = (deps: UpstreamDeps): RangeSource => {
  const cache = new Map<string, { text: string; at: number }>();
  return async (prefix) => {
    // The route checks it too; here it guards against any other caller
    if (!isRangePrefix(prefix)) return undefined;
    const hit = cache.get(prefix);
    if (hit && deps.now() - hit.at < RANGE_TTL_MS) return hit.text;
    cache.delete(prefix);
    const text = await ask(deps, prefix);
    if (text === undefined) return undefined;
    // The oldest range goes first: a Map keeps the order things were put in
    if (cache.size >= MAX_CACHED_RANGES) cache.delete(cache.keys().next().value ?? "");
    cache.set(prefix, { text, at: deps.now() });
    return text;
  };
};
