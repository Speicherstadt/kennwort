/**
 * One-time links on the server (K-601, P-18): a member stores the F-15 ciphertext and lists and
 * revokes its links; anyone with an address fetches once. Only the ciphertext goes out, the secret
 * stays in the address's fragment; every answer is parsed before it is used.
 */
import {
  encodeBytes,
  type LinkCreate,
  LinkCreated,
  LinkFetched,
  LinkList,
  type LinkSummary,
} from "@kennwort/core";
import type { Call } from "./api.ts";

/** What a fetch can end in besides the ciphertext: gone (unknown, used up, expired), too many, no server */
export type LinkFetchError = "gone" | "too-many-requests" | "unreachable" | "unexpected";

const fetchError = (status: number): LinkFetchError =>
  status === 404
    ? "gone"
    : status === 429
      ? "too-many-requests"
      : status === 0
        ? "unreachable"
        : "unexpected";

export const linkCalls = (call: Call) => ({
  createLink: async (token: string, link: LinkCreate) => {
    const answer = await call(
      "POST",
      "/api/links",
      { ...link, ciphertext: encodeBytes(link.ciphertext) },
      token,
    );
    const parsed = LinkCreated.safeParse(answer.json);
    return answer.status === 201 && parsed.success ? parsed.data : undefined;
  },
  myLinks: async (token: string): Promise<LinkSummary[] | undefined> => {
    const answer = await call("GET", "/api/links", undefined, token);
    const parsed = LinkList.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.links : undefined;
  },
  revokeLink: async (token: string, id: string) =>
    (await call("DELETE", `/api/links/${encodeURIComponent(id)}`, undefined, token)).status === 200,
  /** One fetch, without an account: it counts, so only after the recipient asked for it */
  fetchLink: async (fetchId: string) => {
    const answer = await call("POST", `/auth/links/${encodeURIComponent(fetchId)}/open`);
    const parsed = LinkFetched.safeParse(answer.json);
    return answer.status === 200 && parsed.success
      ? ({ ok: true, value: parsed.data } as const)
      : ({ ok: false, error: fetchError(answer.status) } as const);
  },
});

export type LinkApi = ReturnType<typeof linkCalls>;
