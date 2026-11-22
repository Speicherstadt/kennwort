/** Members and invitations (K-304): the server keeps and hands out, the client checks (members.ts) */
import {
  type Certificate,
  CompanyWire,
  encodeBytes,
  InvitedWire,
  MembersWire,
  type NewInvitation,
  RootGrantWire,
  StaleWire,
  toWire,
} from "@kennwort/core";
import type { Call } from "./api.ts";

export type StateWrite = { ok: true } | { ok: false; stale: boolean };

export const memberCalls = (call: Call) => ({
  company: async (token: string) => {
    const parsed = CompanyWire.safeParse(
      (await call("GET", "/api/company", undefined, token)).json,
    );
    return parsed.success ? parsed.data : undefined;
  },
  members: async (token: string) => {
    const answer = await call("GET", "/api/members", undefined, token);
    const parsed = MembersWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.members : undefined;
  },
  invite: async (token: string, invitation: NewInvitation, label: string) => {
    const body = {
      id: encodeBytes(invitation.id),
      sealedSecret: encodeBytes(invitation.sealedSecret),
      label,
    };
    const answer = await call("POST", "/api/invitations", body, token);
    const parsed = InvitedWire.safeParse(answer.json);
    return answer.status === 201 && parsed.success ? parsed.data : undefined;
  },
  certify: async (token: string, certificate: Certificate) =>
    (
      await call(
        "PUT",
        `/api/members/${encodeBytes(certificate.accountId)}/certificate`,
        toWire(certificate),
        token,
      )
    ).status === 200,
  /** The root key wrapped to this account, once an owner made it owner or admin */
  rootGrant: async (token: string) => {
    const answer = await call("GET", "/api/account/root-grant", undefined, token);
    const parsed = RootGrantWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.rootGrant : undefined;
  },
  changeRole: async (
    token: string,
    certificate: Certificate,
    rootGrant: Uint8Array | undefined,
    recoveryGrant?: Uint8Array,
  ) =>
    (
      await call(
        "PUT",
        `/api/members/${encodeBytes(certificate.accountId)}/role`,
        {
          certificate: toWire(certificate),
          ...(rootGrant ? { rootGrant: encodeBytes(rootGrant) } : {}),
          ...(recoveryGrant ? { recoveryGrant: encodeBytes(recoveryGrant) } : {}),
        },
        token,
      )
    ).status === 200,
  /**
   * The account leaves the company (K-307, P-11): the server shuts it out at once; its vaults then
   * owe a removal and a key rotation, which a manager's client signs
   */
  leave: async (token: string, accountId: Uint8Array) =>
    (await call("DELETE", `/api/members/${encodeBytes(accountId)}`, undefined, token)).status ===
    200,
  /** The sealed account state under the next counter; stale when another device wrote first */
  writeState: async (token: string, sealed: Uint8Array, counter: number): Promise<StateWrite> => {
    const answer = await call(
      "PUT",
      "/api/account/state",
      { state: encodeBytes(sealed), stateCounter: counter },
      token,
    );
    if (answer.status === 200) return { ok: true };
    return { ok: false, stale: StaleWire.safeParse(answer.json).success };
  },
});

export type MembersApi = ReturnType<typeof memberCalls>;
