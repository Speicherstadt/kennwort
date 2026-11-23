/** Errors as values for the operations, written as packages/core writes them */
export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const err = <E extends string>(error: E): { ok: false; error: E } => ({ ok: false, error });
