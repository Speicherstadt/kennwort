/**
 * Sign-in with OpenID Connect (K-604, P-25): whether the server has a provider, what a login's
 * ticket means, the enrolment with a new account's IDs and sign-in key, and for a signed-in account
 * its link and, for owners and admins, the enrolment switch. Every answer is parsed before use.
 */
import {
  type AccountUpload,
  encodeBytes,
  OidcLinkWire,
  OidcProviderWire,
  OidcStatusWire,
  type OidcTicket,
  OidcTicketWire,
  SessionWire,
} from "@kennwort/core";
import type { Call } from "./api.ts";

export type OidcError = "invalid-ticket" | "too-many-requests" | "unexpected";
const errorOf = (status: number): OidcError =>
  status === 410 ? "invalid-ticket" : status === 429 ? "too-many-requests" : "unexpected";

export const oidcCalls = (call: Call) => ({
  /** The provider's name, or undefined when the server has none */
  oidcProvider: async () => {
    const answer = await call("GET", "/auth/oidc");
    const parsed = OidcProviderWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.name : undefined;
  },
  redeemTicket: async (
    ticket: string,
  ): Promise<{ ok: true; value: OidcTicket } | { ok: false; error: OidcError }> => {
    const answer = await call("POST", "/auth/oidc/ticket", { ticket });
    const parsed = OidcTicketWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, error: errorOf(answer.status) };
  },
  /** Only IDs and public keys go out, as with an invitation (P-08) */
  enrolOidc: async (
    ticket: string,
    upload: AccountUpload,
  ): Promise<{ ok: true; value: string } | { ok: false; error: OidcError }> => {
    const answer = await call("POST", "/auth/oidc/enrol", {
      ticket,
      accountId: encodeBytes(upload.accountId),
      loginPublicKey: encodeBytes(upload.loginPublicKey),
      accountSalt: encodeBytes(upload.accountSalt),
    });
    const parsed = SessionWire.safeParse(answer.json);
    return answer.status === 201 && parsed.success
      ? { ok: true, value: parsed.data.token }
      : { ok: false, error: errorOf(answer.status) };
  },
  oidcStatus: async (token: string) => {
    const answer = await call("GET", "/api/oidc", undefined, token);
    const parsed = OidcStatusWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data : undefined;
  },
  setEnrolment: async (token: string, open: boolean) =>
    (await call("PUT", "/api/oidc/enrolment", { open }, token)).status === 200,
  /** The provider's address to link this account; the answer also sets the flow's cookie */
  linkOidc: async (token: string) => {
    const answer = await call("POST", "/api/oidc/link", {}, token);
    const parsed = OidcLinkWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.url : undefined;
  },
});

export type OidcApi = ReturnType<typeof oidcCalls>;
