/**
 * The creator's side of a one-time link (K-601, P-18): seal the content on this device, store only
 * the ciphertext with an expiry and a number of fetches, and build the address with the secret in
 * its fragment. Neither the secret nor the passphrase goes to the server.
 */
import type { LinkApi } from "@kennwort/client/session/links-api.ts";
import { type LinkContent, linkAddress, sealLinkContent } from "@kennwort/core";

export type LinkOptions = { expiresInMs: number; maxFetches: number; passphrase: string };
export type MadeLink = { address: string; expiresAt: number };
export type MakeError = "too-large" | "failed";

export type MakeDeps = {
  api: Pick<LinkApi, "createLink">;
  token: string;
  /** The app's own origin: the recipient opens the address there */
  origin: string;
};

/** A link to the content; an empty passphrase means none */
export const makeLink = async (
  { api, token, origin }: MakeDeps,
  content: LinkContent,
  { expiresInMs, maxFetches, passphrase }: LinkOptions,
): Promise<{ ok: true; value: MadeLink } | { ok: false; error: MakeError }> => {
  const sealed = await sealLinkContent(content, passphrase === "" ? undefined : passphrase);
  if (!sealed.ok) return sealed;
  const { secret, ciphertext } = sealed.value;
  const made = await api.createLink(token, { ciphertext, expiresInMs, maxFetches });
  if (!made) return { ok: false, error: "failed" };
  return {
    ok: true,
    value: { address: linkAddress(origin, made.fetchId, secret), expiresAt: made.expiresAt },
  };
};
