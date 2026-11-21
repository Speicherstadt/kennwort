/**
 * Zod building blocks for the JSON exports: managers write `null`, leave a key out or write an
 * empty value for the same thing, and a parser should not care which.
 */
import { z } from "zod";

/** A text that may be null or missing, read as empty */
export const text = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

/** A list that may be null or missing, read as empty */
export const list = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((value) => value ?? []);

/** A yes or no that may be null or missing, read as no */
export const flag = z
  .boolean()
  .nullish()
  .transform((value) => value === true);

/** An object that may be null or missing, read with every part empty */
export const section = <S extends z.ZodRawShape>(shape: S) => {
  const schema = z.object(shape);
  return schema.nullish().transform((value) => value ?? schema.parse({}));
};
