/**
 * The recipient's side of a one-time link (K-601, P-18), apart from the page: what to show for the
 * address it was opened on, after the fetch and after a passphrase. The fetch counts against the
 * link, so it happens only when the recipient asks for it; a link preview or a scanner that loads
 * the page fetches nothing.
 */
import type { LinkApi } from "@kennwort/client/session/links-api.ts";
import { isLinkId, type LinkContent, openLinkContent, readLinkSecret } from "@kennwort/core";

export type SecretView =
  /** The address lacks a valid ID or secret: no fetch would help, so none is offered */
  | { state: "broken" }
  | { state: "ready" }
  | { state: "loading" }
  | { state: "gone" }
  | { state: "too-many" }
  | { state: "unreachable" }
  /** Fetched, but the secret does not open it or it holds no content: changed on the way */
  | { state: "damaged" }
  | { state: "passphrase"; ciphertext: Uint8Array; remaining: number; wrong: boolean }
  | { state: "open"; content: LinkContent; remaining: number };

export type SecretLink = { fetchId: string; secret: Uint8Array };

/** The fetch ID from the path and the secret from the fragment, or undefined when either is off */
export const readSecretLink = (fetchId: string, hash: string): SecretLink | undefined => {
  const secret = readLinkSecret(hash);
  return secret && isLinkId(fetchId) ? { fetchId, secret } : undefined;
};

/** What the fetched ciphertext shows: the content, a question for the passphrase, or damaged */
export const openFetched = async (
  ciphertext: Uint8Array,
  secret: Uint8Array,
  remaining: number,
  passphrase?: string,
): Promise<SecretView> => {
  const opened = await openLinkContent(ciphertext, secret, passphrase);
  if (opened.ok) return { state: "open", content: opened.value, remaining };
  if (opened.error === "needs-passphrase")
    return { state: "passphrase", ciphertext, remaining, wrong: false };
  // With a passphrase given, a wrong one and a changed ciphertext look the same: ask again
  if (passphrase !== undefined && opened.error === "wrong-secret")
    return { state: "passphrase", ciphertext, remaining, wrong: true };
  return { state: "damaged" };
};

/** The one fetch, then the view of what came back */
export const fetchSecret = async (
  fetchLink: LinkApi["fetchLink"],
  link: SecretLink,
): Promise<SecretView> => {
  const fetched = await fetchLink(link.fetchId);
  if (fetched.ok)
    return openFetched(fetched.value.ciphertext, link.secret, fetched.value.remaining);
  // No server or an answer it did not expect: nothing was taken that the recipient could see, so
  // trying again is all there is
  const error = fetched.error;
  return error === "gone"
    ? { state: "gone" }
    : error === "too-many-requests"
      ? { state: "too-many" }
      : { state: "unreachable" };
};
