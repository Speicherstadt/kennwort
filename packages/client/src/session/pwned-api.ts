/**
 * The leak check's range on the server (K-603, P-23): only the five-character SHA-1 prefix goes
 * out, in the path; the server passes on the range of the configured service, padding included.
 * The suffixes are compared on the device (packages/core, createLeakCheck).
 */
import type { LeakError } from "@kennwort/core";
import type { Result } from "@kennwort/crypto";
import type { Call } from "./api.ts";

const errorOf = (status: number): LeakError =>
  status === 404 ? "unavailable" : status === 429 ? "limited" : "unreachable";

const rangeOf = (json: unknown) =>
  typeof json === "object" && json !== null && "range" in json && typeof json.range === "string"
    ? json.range
    : undefined;

export const pwnedCalls = (call: Call) => ({
  pwnedRange: async (token: string, prefix: string): Promise<Result<string, LeakError>> => {
    const answer = await call("GET", `/api/pwned/${encodeURIComponent(prefix)}`, undefined, token);
    if (answer.status !== 200) return { ok: false, error: errorOf(answer.status) };
    const range = rangeOf(answer.json);
    return range === undefined ? { ok: false, error: "malformed" } : { ok: true, value: range };
  },
});

export type PwnedApi = ReturnType<typeof pwnedCalls>;
