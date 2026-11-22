/** The call that renews the account's keys after its recovery kit got into other hands (P-12) */
import { type RekeyUpload, rekeyToWire } from "@kennwort/core";
import type { Call } from "./api.ts";

export type RekeyAnswer = "ok" | "stale" | "unreachable" | "refused";

export const renewalCalls = (call: Call) => ({
  /** "stale" when another device wrote the account state meanwhile */
  rekey: async (token: string, upload: RekeyUpload): Promise<RekeyAnswer> => {
    const { status } = await call("PUT", "/api/account/rekey", rekeyToWire(upload), token);
    if (status === 200) return "ok";
    if (status === 409) return "stale";
    return status === 0 ? "unreachable" : "refused";
  },
});
