/**
 * The calls of emergency access (K-307 part d, P-14); every answer is parsed before it is used and
 * none is trusted: grants, statements and keys are checked by emergency/emergency.ts.
 */
import {
  type EmergencyGrant,
  EmergencyListWire,
  type EmergencyPackages,
  EmergencyVaultsWire,
  encodeBytes,
  grantToWire,
  packagesToWire,
  ReleaseWire,
  type Statement,
  statementToWire,
} from "@kennwort/core";
import type { Call } from "./api.ts";

export type Saved = "ok" | "stale" | "refused" | "unreachable";
/** Why the packages did not come: no request, still waiting, objected, or no answer */
export type Withheld = "none" | "waiting" | "objected" | "unreachable";

const RELEASE_ERRORS: Record<number, Withheld> = { 403: "waiting", 404: "none", 409: "objected" };

const path = (accountId: Uint8Array, rest = "") =>
  `/api/emergency/${encodeBytes(accountId)}${rest}`;

export const emergencyCalls = (call: Call) => ({
  emergencyList: async (token: string) => {
    const answer = await call("GET", "/api/emergency", undefined, token);
    const parsed = EmergencyListWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data : undefined;
  },
  saveGrant: async (
    token: string,
    grant: EmergencyGrant,
    packages: EmergencyPackages,
  ): Promise<Saved> => {
    const body = { grant: grantToWire(grant), packages: packagesToWire(packages) };
    const answer = await call("PUT", path(grant.grantee), body, token);
    if (answer.status === 200) return "ok";
    if (answer.status === 409) return "stale";
    return answer.status === 0 ? "unreachable" : "refused";
  },
  revokeGrant: async (token: string, revocation: Statement) =>
    (await call("DELETE", path(revocation.grantee), statementToWire(revocation), token)).status ===
    200,
  requestEmergency: async (token: string, request: Statement) =>
    (await call("POST", path(request.grantor, "/request"), statementToWire(request), token))
      .status === 201,
  objectEmergency: async (token: string, objection: Statement) =>
    (await call("POST", path(objection.grantee, "/objection"), statementToWire(objection), token))
      .status === 200,
  approveEmergency: async (token: string, approval: Statement) =>
    (await call("POST", path(approval.grantee, "/approval"), statementToWire(approval), token))
      .status === 200,
  emergencyRelease: async (token: string, grantorId: Uint8Array) => {
    const answer = await call("GET", path(grantorId, "/release"), undefined, token);
    const parsed = ReleaseWire.safeParse(answer.json);
    if (answer.status === 200 && parsed.success) return { ok: true as const, value: parsed.data };
    return { ok: false as const, error: RELEASE_ERRORS[answer.status] ?? "unreachable" };
  },
  emergencyVaults: async (token: string, grantorId: Uint8Array) => {
    const answer = await call("GET", path(grantorId, "/vaults"), undefined, token);
    const parsed = EmergencyVaultsWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.vaults : undefined;
  },
});

export type EmergencyApi = ReturnType<typeof emergencyCalls>;
