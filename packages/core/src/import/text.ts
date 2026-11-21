/**
 * Reading an export file as text: UTF-8 with or without a byte order mark, as every manager here
 * writes it. JSON exports are parsed and checked against the vendor's structure with Zod.
 */
import type { Result } from "@kennwort/crypto";
import type { z } from "zod";
import { err, ok } from "../result.ts";
import type { ImportError } from "./types.ts";

const BOM = "﻿";
const utf8 = new TextDecoder("utf-8", { fatal: true });

const withoutBom = (text: string) => (text.startsWith(BOM) ? text.slice(1) : text);

/** The file as text; bytes that are not UTF-8 are an error, not replacement characters */
export const decodeText = (input: string | Uint8Array): Result<string, "not-text"> => {
  if (typeof input === "string") return ok(withoutBom(input));
  try {
    // TextDecoder drops a leading BOM itself
    return ok(utf8.decode(input));
  } catch {
    return err("not-text");
  }
};

const parsed = (text: string): Result<unknown, "bad-json"> => {
  try {
    return ok(JSON.parse(text));
  } catch {
    return err("bad-json");
  }
};

/** A JSON export with the vendor's structure, or why not */
export const readJson = <S extends z.ZodType>(
  input: string | Uint8Array,
  schema: S,
): Result<z.infer<S>, ImportError> => {
  const text = decodeText(input);
  if (!text.ok) return text;
  const json = parsed(text.value);
  if (!json.ok) return json;
  const checked = schema.safeParse(json.value);
  return checked.success ? ok(checked.data) : err("wrong-format");
};

/** A cell or attribute that holds JSON (NordPass's lists); anything else reads as the fallback */
export const jsonCell = <S extends z.ZodType>(text: string, schema: S, fallback: z.infer<S>) => {
  const json = parsed(text);
  const checked = json.ok ? schema.safeParse(json.value) : undefined;
  return checked?.success ? checked.data : fallback;
};
