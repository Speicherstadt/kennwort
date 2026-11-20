/** The company policy (K-304, F-07): the server keeps the signed policy, the client checks it */
import { type Policy, policyToWire } from "@kennwort/core";
import type { Call } from "./api.ts";

export const policyCalls = (call: Call) => ({
  savePolicy: async (token: string, policy: Policy) =>
    (await call("PUT", "/api/company/policy", policyToWire(policy), token)).status === 200,
});

export type PolicyApi = ReturnType<typeof policyCalls>;
