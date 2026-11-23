/**
 * Deleting the account and downloading what the server keeps about it (K-607, P-28): what a
 * deletion would do, the challenge the sign-in key answers, the deletion itself and the export.
 */
import { bytes, encodeBytes } from "@kennwort/core";
import type { Call } from "./api.ts";

const FATES = ["drop", "leave", "await", "sole-manager"] as const;
export type ServerDeletionPlan = {
  vaults: Record<(typeof FATES)[number], string[]>;
  refused: "last-owner" | "sole-manager" | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === "string");
const REFUSALS = ["last-owner", "sole-manager"] as const;
const refusalIn = (value: unknown) => REFUSALS.find((r) => r === value);

const planOf = (json: unknown): ServerDeletionPlan | undefined => {
  if (!isRecord(json) || !isRecord(json.vaults)) return undefined;
  const { vaults } = json;
  if (!FATES.every((fate) => isIds(vaults[fate]))) return undefined;
  const refused = json.refused === null ? null : refusalIn(json.refused);
  if (refused === undefined) return undefined;
  return { vaults: vaults as ServerDeletionPlan["vaults"], refused };
};

export type DeletionChallenge = {
  challengeId: string;
  challenge: Uint8Array;
  accountSalt: Uint8Array;
};

const challengeOf = (json: unknown): DeletionChallenge | undefined => {
  if (!isRecord(json) || typeof json.challengeId !== "string" || json.challengeId === "")
    return undefined;
  const challenge = bytes(32).safeParse(json.challenge);
  const accountSalt = bytes(16).safeParse(json.accountSalt);
  return challenge.success && accountSalt.success
    ? { challengeId: json.challengeId, challenge: challenge.data, accountSalt: accountSalt.data }
    : undefined;
};

/** Why the server did not delete: as the server says it, or that it did not answer */
export type DeletionRefusal =
  | "denied"
  | "locked"
  | "last-owner"
  | "sole-manager"
  | "unreachable"
  | "unexpected";

const refusalOf = (status: number, json: unknown): DeletionRefusal => {
  if (status === 0) return "unreachable";
  if (status === 401) return "denied";
  if (status === 423) return "locked";
  const refused = status === 409 && isRecord(json) ? refusalIn(json.error) : undefined;
  return refused ?? "unexpected";
};

export const privacyCalls = (call: Call) => ({
  /** What deleting the account would do now, by the server's view of the logs */
  deletionPlan: async (token: string) => {
    const answer = await call("GET", "/api/account/deletion", undefined, token);
    return answer.status === 200 ? planOf(answer.json) : undefined;
  },
  deletionChallenge: async (token: string) => {
    const answer = await call("POST", "/api/account/deletion/challenge", undefined, token);
    return answer.status === 200 ? challengeOf(answer.json) : undefined;
  },
  deleteAccount: async (
    token: string,
    challengeId: string,
    signature: Uint8Array,
  ): Promise<{ ok: true; company: boolean } | { ok: false; error: DeletionRefusal }> => {
    const body = { challengeId, signature: encodeBytes(signature) };
    const answer = await call("DELETE", "/api/account", body, token);
    const json = answer.json;
    return answer.status === 200 && isRecord(json) && json.deleted === true
      ? { ok: true, company: json.company === true }
      : { ok: false, error: refusalOf(answer.status, json) };
  },
  /** The server's data about the account as JSON, for a download; undefined when it gave none */
  privacyExport: async (token: string) => {
    const answer = await call("GET", "/api/account/export", undefined, token);
    return answer.status === 200 && isRecord(answer.json) ? answer.json : undefined;
  },
});

export type PrivacyApi = ReturnType<typeof privacyCalls>;
