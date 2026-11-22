/**
 * What a one-time link carries (K-601, P-18): a title and the fields to show, as JSON inside the
 * F-15 ciphertext. Plain data, nothing of the vault: no IDs, no history, no tags, no TOTP seed.
 * The recipient reads it only after the parse below, so a forged plaintext under a known secret
 * cannot reach the page as anything but these strings.
 */
import { z } from "zod";
import { err, ok, type Result } from "../result.ts";
import type { FieldKind } from "../sync/content.ts";

export const LINK_TITLE_MAX = 200;
export const LINK_LABEL_MAX = 200;
export const LINK_VALUE_MAX = 20_000;
export const LINK_FIELDS_MAX = 50;

export const LinkField = z.object({
  label: z.string().max(LINK_LABEL_MAX),
  value: z.string().min(1).max(LINK_VALUE_MAX),
  /** Hidden until the recipient reveals it, like a password in the app */
  secret: z.boolean(),
});
export const LinkContent = z.object({
  version: z.literal(1),
  title: z.string().max(LINK_TITLE_MAX),
  fields: z.array(LinkField).min(1).max(LINK_FIELDS_MAX),
});
export type LinkField = z.infer<typeof LinkField>;
export type LinkContent = z.infer<typeof LinkContent>;

/** An entry as the app shows it: its fields with the labels in the app's language */
export type LinkSource = {
  title: string;
  fields: readonly { label: string; value: string; kind: z.infer<typeof FieldKind> }[];
};

/**
 * The fields of an entry that go into a link: every one with a value, except a TOTP seed, which
 * would give an outsider the second factor for good
 */
export const linkContentOfEntry = (entry: LinkSource): LinkContent => ({
  version: 1,
  title: entry.title,
  fields: entry.fields
    .filter((field) => field.value !== "" && field.kind !== "totp")
    .map((field) => ({ label: field.label, value: field.value, secret: field.kind === "secret" })),
});

/** A free text for a link, hidden like a password until the recipient reveals it */
export const linkContentOfText = (title: string, label: string, text: string): LinkContent => ({
  version: 1,
  title,
  fields: [{ label, value: text, secret: true }],
});

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder("utf-8", { fatal: true });

export const encodeLinkContent = (content: LinkContent): Uint8Array =>
  utf8.encode(JSON.stringify(LinkContent.parse(content)));

/** The content of opened link bytes, or "damaged" for anything but valid content of version 1 */
export const decodeLinkContent = (bytes: Uint8Array): Result<LinkContent, "damaged"> => {
  try {
    const parsed = LinkContent.safeParse(JSON.parse(fromUtf8.decode(bytes)));
    return parsed.success ? ok(parsed.data) : err("damaged");
  } catch {
    return err("damaged");
  }
};
