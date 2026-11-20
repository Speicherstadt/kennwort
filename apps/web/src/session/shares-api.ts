/**
 * Shares of single entries on the server (K-305 part 6, P-10): it keeps the signed shares and hands
 * a recipient the newest record of exactly the shared entries; shares.ts and shared.ts check both
 */
import { EntryRecord, encodeBytes, type Share, SharesWire, shareToWire } from "@kennwort/core";
import type { Call } from "./api.ts";

const sharesPath = (vaultId: Uint8Array, entryId: Uint8Array) =>
  `/api/vaults/${encodeBytes(vaultId)}/entries/${encodeBytes(entryId)}/shares`;

const sharesOf = (answer: { status: number; json: unknown }) => {
  const parsed = SharesWire.safeParse(answer.json);
  return answer.status === 200 && parsed.success ? parsed.data.shares : undefined;
};

export const shareCalls = (call: Call) => ({
  putShare: async (token: string, share: Share) =>
    (await call("PUT", sharesPath(share.vaultId, share.entryId), shareToWire(share), token))
      .status === 200,
  entryShares: async (token: string, vaultId: Uint8Array, entryId: Uint8Array) =>
    sharesOf(await call("GET", sharesPath(vaultId, entryId), undefined, token)),
  deleteShare: async (
    token: string,
    vaultId: Uint8Array,
    entryId: Uint8Array,
    recipient: Uint8Array,
  ) =>
    (
      await call(
        "DELETE",
        `${sharesPath(vaultId, entryId)}/${encodeBytes(recipient)}`,
        undefined,
        token,
      )
    ).status === 200,
  /** The shares made to this account; a share the server stopped serving is simply not listed */
  sharedWithMe: async (token: string) =>
    sharesOf(await call("GET", "/api/shared", undefined, token)),
  sharedRecord: async (token: string, vaultId: Uint8Array, entryId: Uint8Array) => {
    const path = `/api/shared/${encodeBytes(vaultId)}/${encodeBytes(entryId)}`;
    const answer = await call("GET", path, undefined, token);
    const parsed = EntryRecord.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data : undefined;
  },
});

export type ShareApi = ReturnType<typeof shareCalls>;
