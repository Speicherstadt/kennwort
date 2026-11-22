/**
 * The leak check of the security overview (K-603, docs/sicherheitsdesign.md P-23): which of the
 * given passwords appear in Have I Been Pwned's Pwned Passwords, by k-anonymity. Per password only
 * the first five hex characters of its SHA-1 go to `fetchRange`; the range that comes back is
 * compared with the other 35 on the device. Nothing at all goes out while the check is off.
 *
 * Each prefix is asked once and its range kept in memory for as long as the check lives (the open
 * account), never on a disk; a range that failed is asked again next time. Prefixes go out in
 * sorted order, a few at a time: the order says nothing about which entry a prefix belongs to.
 */
import { pwnedHash } from "@kennwort/crypto";
import { err, ok, type Result } from "../result.ts";
import { parseRange } from "./range.ts";

/**
 * Off: switched off here, nothing was asked; unavailable: the server does not offer the check;
 * limited: too many requests; unreachable: no answer; malformed: the answer was no range
 */
export type LeakError = "off" | "unavailable" | "limited" | "unreachable" | "malformed";

/** The range of one prefix as the server or service sends it, or why there is none */
export type FetchRange = (prefix: string) => Promise<Result<string, LeakError>>;

/** At most this many ranges are asked for at the same time */
export const LEAK_CONCURRENCY = 4;

/** For each leaked password how often the list has it; passwords not in it are left out */
export type LeakCounts = ReadonlyMap<string, number>;

const NO_RANGE: ReadonlyMap<string, number> = new Map();

export const createLeakCheck = (fetchRange: FetchRange) => {
  const ranges = new Map<string, ReadonlyMap<string, number>>();
  /** Loads one range unless it is kept already; undefined when it is there, else why not */
  const load = async (prefix: string): Promise<LeakError | undefined> => {
    if (ranges.has(prefix)) return undefined;
    const fetched = await fetchRange(prefix);
    if (!fetched.ok) return fetched.error;
    const parsed = parseRange(fetched.value);
    if (!parsed.ok) return parsed.error;
    ranges.set(prefix, parsed.value);
    return undefined;
  };
  /** A few at a time; the first batch with a failure ends it, the batches after it go nowhere */
  const loadAll = async (prefixes: readonly string[]): Promise<LeakError | undefined> => {
    if (prefixes.length === 0) return undefined;
    const failures = await Promise.all(prefixes.slice(0, LEAK_CONCURRENCY).map(load));
    return (
      failures.find((failure) => failure !== undefined) ?? loadAll(prefixes.slice(LEAK_CONCURRENCY))
    );
  };
  return {
    /** The leaked passwords among these; while `enabled` is false, err("off") and no request */
    check: async (
      passwords: readonly string[],
      enabled: boolean,
    ): Promise<Result<LeakCounts, LeakError>> => {
      if (!enabled) return err("off");
      const hashes = new Map(
        passwords.filter((p) => p !== "").map((password) => [password, pwnedHash(password)]),
      );
      const prefixes = [...new Set([...hashes.values()].map((hash) => hash.prefix))].sort();
      const failure = await loadAll(prefixes);
      if (failure) return err(failure);
      const counts = new Map<string, number>();
      for (const [password, { prefix, suffix }] of hashes) {
        const count = (ranges.get(prefix) ?? NO_RANGE).get(suffix);
        if (count !== undefined) counts.set(password, count);
      }
      return ok(counts);
    },
  };
};

export type LeakCheck = ReturnType<typeof createLeakCheck>;
