/**
 * Logs as one JSON line each. A log never carries a secret (CLAUDE.md, Never): request bodies,
 * headers and query strings are not logged at all, and fields with names that sound like secrets
 * are replaced before writing, in case a caller passes one by mistake.
 */
export type Level = "debug" | "info" | "warn" | "error";
export type Fields = Record<string, string | number | boolean | undefined>;
export type Log = (level: Level, message: string, fields?: Fields) => void;

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const SECRET_NAME =
  /pass|secret|token|key|auth|cookie|session|signature|ciphertext|body|credential|otp|totp|recovery|mnemonic|seed|jwt|pin|prf/i;

export const redact = (fields: Fields): Fields =>
  Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [
      name,
      SECRET_NAME.test(name) ? "[redacted]" : value,
    ]),
  );

/**
 * A request's path as the log writes it: the fetch ID of a one-time link (K-601, P-18) fetches the
 * link's ciphertext and uses up its count, so like the database the log keeps none (review of
 * K-601); the SHA-1 prefix of the leak check (K-603, P-23) tells something of a password, so the
 * log keeps none of it either
 */
export const pathForLog = (path: string) =>
  path
    .replace(/^\/auth\/links\/[^/]*/, "/auth/links/:fetchId")
    .replace(/^\/api\/pwned\/.*/, "/api/pwned/:prefix");

export const createLog =
  (minimum: Level, write: (line: string) => void, now: () => Date = () => new Date()): Log =>
  (level, message, fields = {}) => {
    if (ORDER[level] < ORDER[minimum]) return;
    write(JSON.stringify({ time: now().toISOString(), level, message, ...redact(fields) }));
  };
