/**
 * A one-time link end to end (K-601, P-18): the content sealed into F-15 for the server, the
 * secret into the fragment of `/s/<fetch-ID>#<secret>`, and back. The fragment never reaches the
 * server: browsers do not send it, and the recipient's page drops it from the address at once.
 */
import { LINK_SECRET_LENGTH, type LinkOpenError, openLink, sealLink } from "@kennwort/crypto";
import { err, ok, type Result } from "../result.ts";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import { decodeLinkContent, encodeLinkContent, LinkContent } from "./content.ts";
import { LINK_LIMITS, LinkIdText } from "./wire.ts";

const Secret = bytes(LINK_SECRET_LENGTH);
/** Padding block (P-15): the server learns the content's length only to 256 bytes */
const BLOCK = 256;
/**
 * The most padded plaintext the server stores: one block below its limit leaves room for what
 * F-15 adds (version, kind, salt, then version, nonce and tag of F-01: 59 bytes)
 */
const MAX_PLAINTEXT = LINK_LIMITS.maxBytes - BLOCK;
const SPACE = 0x20;

export type SealedLink = { secret: Uint8Array; ciphertext: Uint8Array };

/**
 * The content sealed under a fresh secret, or "too-large" past the limits: of the content (more
 * fields or longer values than LinkContent takes) or of what the server stores. The JSON goes in
 * with spaces after it up to the next multiple of 256 bytes, which JSON.parse skips.
 */
export const sealLinkContent = async (
  content: LinkContent,
  passphrase?: string,
): Promise<Result<SealedLink, "too-large">> => {
  if (!LinkContent.safeParse(content).success) return err("too-large");
  const json = encodeLinkContent(content);
  const size = Math.ceil(json.length / BLOCK) * BLOCK;
  if (size > MAX_PLAINTEXT) {
    json.fill(0);
    return err("too-large");
  }
  const plaintext = new Uint8Array(size).fill(SPACE);
  plaintext.set(json);
  json.fill(0);
  const { secret, link } = await sealLink(plaintext, passphrase);
  plaintext.fill(0);
  return ok({ secret, ciphertext: link });
};

export type LinkReadError = LinkOpenError | "damaged";

export const openLinkContent = async (
  ciphertext: Uint8Array,
  secret: Uint8Array,
  passphrase?: string,
): Promise<Result<LinkContent, LinkReadError>> => {
  const opened = await openLink(secret, ciphertext, passphrase);
  if (!opened.ok) return opened;
  const content = decodeLinkContent(opened.value);
  opened.value.fill(0);
  return content;
};

/** The address the recipient opens: the fetch ID in the path, the secret in the fragment */
export const linkAddress = (origin: string, fetchId: string, secret: Uint8Array) =>
  `${origin}/s/${fetchId}#${encodeBytes(secret)}`;

/** The secret of a link's fragment (`#…`, taken from the address once), or undefined */
export const readLinkSecret = (hash: string): Uint8Array | undefined => {
  const parsed = Secret.safeParse(hash.replace(/^#/, ""));
  return parsed.success ? parsed.data : undefined;
};

/** Whether a path segment can be a fetch ID at all; anything else never goes to the server */
export const isLinkId = (text: string) => LinkIdText.safeParse(text).success;
