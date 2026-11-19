/** Errors as values, as in @kennwort/crypto */
export type { Result } from "@kennwort/crypto";

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const err = <E extends string>(error: E): { ok: false; error: E } => ({ ok: false, error });
