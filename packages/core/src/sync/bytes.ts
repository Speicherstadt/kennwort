/** Bytes on the wire: base64url without padding, parsed by a Zod schema at every boundary */
import { z } from "zod";

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));

export const encodeBytes = toBase64Url;

/** A schema for base64url text that parses to bytes, optionally of an exact length */
export const bytes = (length?: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]*$/)
    .transform((text, ctx) => {
      if (text.length % 4 === 1) {
        ctx.addIssue({ code: "custom", message: "not base64url" });
        return z.NEVER;
      }
      const value = fromBase64Url(text);
      if (length !== undefined && value.length !== length) {
        ctx.addIssue({ code: "custom", message: `expected ${length} bytes` });
        return z.NEVER;
      }
      return value as Uint8Array;
    });
