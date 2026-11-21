/**
 * Test helpers for the import parsers: fixtures from disk and entries in a compact form that still
 * shows every ID, name, value and kind, and every tag, favorite, folder and earlier password.
 */
import { readFileSync } from "node:fs";
import type { ImportResult } from "../types.ts";

/** A fixture as the bytes a person would load */
export const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

/** A fixture as text */
export const fixtureText = (name: string): string => new TextDecoder().decode(fixture(name));

export type Compact = {
  type: string;
  title: string;
  fields: [id: string, name: string, value: string, kind: string][];
  tags?: string[];
  favorite?: true;
  folders?: string[];
  history?: [fieldId: string, value: string, replacedAt: number][];
};

/** The entries in compact form (parts left out are empty), or the error */
export const compact = (result: ImportResult): Compact[] | string => {
  if (!result.ok) return result.error;
  return result.value.map(({ content, folders }) => ({
    type: content.type,
    title: content.title,
    fields: content.fields.map((f) => [f.id, f.name, f.value, f.kind]),
    ...(content.tags.length > 0 && { tags: content.tags }),
    ...(content.favorite && { favorite: true as const }),
    ...(folders.length > 0 && { folders }),
    ...(content.history.length > 0 && {
      history: content.history.map((h) => [h.fieldId, h.value, h.replacedAt]),
    }),
  }));
};
