/**
 * Shares of single entries in the stand-in (K-305 part 6, P-10), as apps/server/src/sync/
 * share-routes.ts keeps them: editors and managers of the vault store a share they signed for a
 * colleague of their company, the recipient lists their shares and fetches the newest record of
 * exactly those entries. The shared contract (sync/test/share-contract.ts) holds both alike.
 */
import { z } from "zod";
import { encodeBytes } from "../sync/bytes.ts";
import { type EntryRecord, parseJson, recordToWire } from "../sync/record.ts";
import { Share, shareToWire } from "../sync/share.ts";
import { json, notFound } from "./answers.ts";

type Session = { accountId: string; companyId: string };
type Deps = {
  sessions: Readonly<Record<string, Session>>;
  now: () => number;
  /** The newest record of an entry, if the vault has one */
  newest: (vaultId: string, entryId: string) => EntryRecord | undefined;
};

const parsedShare = (body: string) =>
  z.object({ ok: z.literal(true), value: Share }).safeParse(parseJson(body));
const keyOf = (vaultId: string, entryId: string, recipient: string) =>
  `${vaultId}/${entryId}/${recipient}`;
/** Without expiry or not expired by the clock (ms), as the server counts it */
const isValid = (share: Share, now: number) =>
  share.validUntil === 0 || share.validUntil * 1000 > now;

export const standInShares = ({ sessions, now, newest }: Deps) => {
  // By vault, entry and recipient (IDs of 16 bytes, so the keys sort as the server's rows do)
  const shares = new Map<string, Share>();
  const sorted = (keep: (key: string, share: Share) => boolean) =>
    [...shares.keys()]
      .sort()
      .filter((key) => keep(key, shares.get(key) as Share))
      .map((key) => shareToWire(shares.get(key) as Share));
  const isColleague = (session: Session, accountId: string) =>
    accountId !== session.accountId &&
    Object.values(sessions).some(
      (other) => other.accountId === accountId && other.companyId === session.companyId,
    );

  /** The server's checks of a share for the entry in the path, in its order */
  const put = (session: Session, vaultId: string, entryId: string, body: string) => {
    const parsed = parsedShare(body);
    if (!parsed.success) return json({ error: "invalid" }, 400);
    const share = parsed.data.value;
    if (encodeBytes(share.vaultId) !== vaultId || encodeBytes(share.entryId) !== entryId)
      return json({ error: "invalid" }, 400);
    if (encodeBytes(share.sharer) !== session.accountId) return json({ error: "forbidden" }, 403);
    const recipient = encodeBytes(share.recipient);
    if (!isColleague(session, recipient)) return json({ error: "invalid" }, 400);
    if (!newest(vaultId, entryId)) return notFound();
    shares.set(keyOf(vaultId, entryId, recipient), share);
    return json({ stored: true });
  };

  /**
   * …/entries/:entryId/shares(/:recipient) of a vault the session is a current member of, with its
   * role; undefined for any other route
   */
  const inVault = (
    session: Session,
    vaultId: string,
    role: string,
    method: string,
    rest: string,
    body: string,
  ) => {
    const match = rest.match(/^\/entries\/([^/]+)\/shares(\/[^/]+)?$/);
    if (!match) return undefined;
    const [, entryId, recipient] = match as unknown as [string, string, string | undefined];
    const call = `${method} ${recipient === undefined ? "shares" : "share"}`;
    if (call === "GET shares")
      return json({ shares: sorted((key) => key.startsWith(keyOf(vaultId, entryId, ""))) });
    const mayShare = role === "edit" || role === "manage";
    if (call === "PUT shares")
      return mayShare ? put(session, vaultId, entryId, body) : json({ error: "forbidden" }, 403);
    if (call !== "DELETE share") return undefined;
    if (!mayShare) return json({ error: "forbidden" }, 403);
    shares.delete(keyOf(vaultId, entryId, (recipient as string).slice(1)));
    return json({ ok: true });
  };

  /** GET /api/shared and GET /api/shared/:vaultId/:entryId; undefined for any other route */
  const shared = (session: Session, method: string, path: string) => {
    if (`${method} ${path}` === "GET /api/shared")
      return json({
        shares: sorted(
          (key, share) => key.endsWith(`/${session.accountId}`) && isValid(share, now()),
        ),
      });
    const match = path.match(/^\/api\/shared\/([^/]+)\/([^/]+)$/);
    if (!match || method !== "GET") return undefined;
    const [, vaultId, entryId] = match as unknown as [string, string, string];
    const share = shares.get(keyOf(vaultId, entryId, session.accountId));
    // Without a valid share the entry does not exist for this account, as on the server
    if (!share || !isValid(share, now())) return notFound();
    return json(recordToWire(newest(vaultId, entryId) as EntryRecord));
  };

  return { inVault, shared };
};
