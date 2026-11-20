/**
 * The company's server as the user types it: only its origin counts, and only over HTTPS. Plain
 * HTTP only on this machine (localhost), for development and the end-to-end tests: anything else
 * would send the session token and the ciphertexts over the network unprotected.
 */
export type ServerError = "invalid-server" | "insecure-server";

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const serverOrigin = (
  typed: string,
): { ok: true; value: string } | { ok: false; error: ServerError } => {
  let url: URL;
  try {
    url = new URL(typed.trim());
  } catch {
    return { ok: false, error: "invalid-server" };
  }
  if (url.username || url.password) return { ok: false, error: "invalid-server" };
  if (url.protocol === "https:") return { ok: true, value: url.origin };
  if (url.protocol === "http:" && LOCAL.has(url.hostname)) return { ok: true, value: url.origin };
  return { ok: false, error: url.protocol === "http:" ? "insecure-server" : "invalid-server" };
};
