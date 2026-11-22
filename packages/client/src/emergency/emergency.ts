/**
 * Emergency access on the client (K-307 part d, P-14), without any interface. The grantor names a
 * certified colleague with a waiting time and either chosen vaults (view) or the whole account
 * (full), objects to or approves a request, revokes, and renews view grants after a key rotation.
 * The grantee sees only grants it checked (checkGrant), remembers in its account state the newest
 * grant, revocations and objections it saw, and asks for access with a request it signs itself.
 *
 * Modelled on Bitwarden's Emergency Access (trusted contact, wait time, objection, "view" or
 * "takeover"); unlike there, nothing the server says about keys is believed (RFC 9180-style wraps
 * with signed commitments, F-09).
 */
import {
  type AccountState,
  type Certificate,
  certificateOf,
  checkGrant,
  type EmergencyGrant,
  type EmergencySeen,
  encodeBytes,
  isBehind,
  isSignedGrant,
  isSignedStatementOf,
  type ListedGrant,
  type MemberView,
  makeGrant,
  mergeEmergency,
  noteGrant,
  noteObjection,
  noteRevocation,
  type Statement,
  signStatement,
  type Trust,
} from "@kennwort/core";
import type { EmergencyStatement } from "@kennwort/crypto";
import type { EmergencyApi, Saved } from "../session/emergency-api.ts";
import type { Opened, UpdateState } from "../session/open-account.ts";
import type { StateDeps } from "../session/state-sync.ts";
import { trustOf, type Vault, type VaultDeps } from "../vaults/vaults.ts";

export type EmergencyDeps = EmergencyApi & VaultDeps & StateDeps;

const seconds = () => Math.floor(Date.now() / 1000);

/** A grant this account gave, as its own signature shows */
export type Given = ListedGrant & { grantee: MemberView | undefined };
/** A grant this account holds, checked, with the grantor's certificate */
export type Received = ListedGrant & { grantor: Certificate; person: MemberView | undefined };
export type Overview = {
  given: Given[];
  received: Received[];
  people: MemberView[];
  trust: Trust;
  me: Certificate;
};

const personOf = (people: MemberView[], accountId: Uint8Array) =>
  people.find((p) => encodeBytes(p.accountId) === encodeBytes(accountId));

/**
 * A statement of this kind from this grantor to this account, signed by the grantor's certified
 * key, about the grant it names; one about another pair (a revocation of a grant to Anna) tells
 * this account nothing
 */
const signedBy = (
  kind: EmergencyStatement,
  statement: Statement | null,
  grantor: Uint8Array,
  me: Certificate,
  trust: Trust,
): statement is Statement => {
  const signer = certificateOf(trust, grantor);
  return (
    statement !== null &&
    signer !== undefined &&
    encodeBytes(statement.grantor) === encodeBytes(grantor) &&
    encodeBytes(statement.grantee) === encodeBytes(me.accountId) &&
    isSignedStatementOf(kind, signer.edPublicKey, me.companyId, statement)
  );
};

/**
 * What the grantee learns from the list: each signed revocation and objection, then each grant
 * that passes against that memory. A replayed or forged grant is left out, never shown.
 */
export const learn = (
  list: { received: ListedGrant[]; revocations: Statement[] },
  me: Certificate,
  trust: Trust,
  remembered: Record<string, EmergencySeen>,
) => {
  const seen = { ...remembered };
  for (const r of list.revocations) {
    const key = encodeBytes(r.grantor);
    if (signedBy("emergency-revocation", r, r.grantor, me, trust))
      seen[key] = noteRevocation(seen[key], r.grantTime);
  }
  for (const listed of list.received) {
    const key = encodeBytes(listed.grant.grantor);
    const objection = listed.objection;
    if (signedBy("emergency-objection", objection, listed.grant.grantor, me, trust))
      seen[key] = noteObjection(seen[key], objection.at);
  }
  const received: (ListedGrant & { grantor: Certificate })[] = [];
  for (const listed of list.received) {
    const key = encodeBytes(listed.grant.grantor);
    const checked = checkGrant(listed.grant, me, trust, seen[key]);
    if (!checked.ok) continue;
    seen[key] = noteGrant(seen[key], listed.grant.time);
    received.push({ ...listed, grantor: checked.value });
  }
  return { seen, received };
};

const sameSeen = (a: Record<string, EmergencySeen>, b: Record<string, EmergencySeen>) =>
  JSON.stringify(a) === JSON.stringify(b);

export type LoadError = "unreachable" | "untrusted" | "uncertified";

/**
 * Both lists, checked; the grantee's memory written back to the account state when it grew. The
 * open account comes from the caller, read where it may be read (a query's options)
 */
export const loadEmergency = async (
  api: EmergencyDeps,
  opened: Opened,
  updateState: UpdateState,
): Promise<{ ok: true; value: Overview } | { ok: false; error: LoadError }> => {
  const [list, checked] = await Promise.all([
    api.emergencyList(opened.token),
    trustOf(api, opened),
  ]);
  if (!list) return { ok: false, error: "unreachable" };
  if (!checked) return { ok: false, error: "untrusted" };
  const { trust, people } = checked;
  const me = certificateOf(trust, opened.accountId);
  if (!me) return { ok: false, error: "uncertified" };
  const { seen, received } = learn(list, me, trust, opened.state.emergency);
  if (!sameSeen(seen, opened.state.emergency))
    await updateState(api, (state: AccountState) => ({
      ...state,
      // Merged, never written over: another device may have seen a revocation or objection since
      emergency: mergeEmergency(state.emergency, seen),
    }));
  const given = list.given
    .filter((g) => isSignedGrant(opened.keyBlock.ed.publicKey, g.grant))
    .map((g) => ({ ...g, grantee: personOf(people, g.grant.grantee) }));
  return {
    ok: true,
    value: {
      given,
      received: received.map((r) => ({ ...r, person: personOf(people, r.grant.grantor) })),
      people,
      trust,
      me,
    },
  };
};

export type Terms =
  | { scope: "view"; vaults: readonly Vault[]; waitSeconds: number }
  | { scope: "full"; waitSeconds: number };

const author = (opened: Opened) => ({
  id: opened.accountId,
  edSecretKey: opened.keyBlock.ed.secretKey,
});

/**
 * Names a colleague: only one the pinned root certified (E-05), with the current key of each
 * chosen vault, or AK for full access. A server that swapped the colleague's key gets nothing.
 */
export const grantAccess = async (
  api: EmergencyDeps,
  opened: Opened,
  trust: Trust,
  granteeId: Uint8Array,
  terms: Terms,
): Promise<Saved | "uncertified"> => {
  const grantee = certificateOf(trust, granteeId);
  if (!grantee || encodeBytes(granteeId) === encodeBytes(opened.accountId)) return "uncertified";
  const keys =
    terms.scope === "view"
      ? { scope: "view" as const, rings: terms.vaults.map((v) => v.ring) }
      : { scope: "full" as const, accountKey: opened.accountKey };
  const made = makeGrant(author(opened), grantee, keys, {
    waitSeconds: terms.waitSeconds,
    time: seconds(),
  });
  return api.saveGrant(opened.token, made.grant, made.packages);
};

const statement = (kind: EmergencyStatement, opened: Opened, grant: EmergencyGrant, at: number) =>
  signStatement(kind, opened.keyBlock.ed.secretKey, grant, at);

/**
 * The grantee asks for access: a request it signs with its own clock's time, later than any
 * request the grantor objected to (a new request within the same second would count as that one)
 */
export const requestAccess = (api: EmergencyApi, opened: Opened, grant: EmergencyGrant) => {
  const objected = opened.state.emergency[encodeBytes(grant.grantor)]?.objected ?? 0;
  const at = Math.max(seconds(), objected + 1);
  return api.requestEmergency(opened.token, statement("emergency-request", opened, grant, at));
};

/** The grantor objects to the running request; the grantee's client remembers it */
export const objectTo = (api: EmergencyApi, opened: Opened, given: ListedGrant) =>
  given.request
    ? api.objectEmergency(
        opened.token,
        statement("emergency-objection", opened, given.grant, given.request.at),
      )
    : Promise.resolve(false);

/** The grantor lets the packages out before the waiting time ends */
export const approveEarly = (api: EmergencyApi, opened: Opened, given: ListedGrant) =>
  given.request
    ? api.approveEmergency(
        opened.token,
        statement("emergency-approval", opened, given.grant, given.request.at),
      )
    : Promise.resolve(false);

/** The grantor ends the grant; the signed revocation tells the grantee's client */
export const revoke = (api: EmergencyApi, opened: Opened, grant: EmergencyGrant) =>
  api.revokeGrant(opened.token, statement("emergency-revocation", opened, grant, grant.time));

/**
 * After a key rotation (P-11) the grantor's view grants carry an old vault key, which opens only
 * what was written before it. Each such grant is made anew with the current keys of the vaults it
 * names that this account still holds, under the same terms. The new grant ends a running request
 * (requests name their grant): the grantor renewing is evidently there to approve a new one.
 */
export const renewGrants = async (
  api: EmergencyDeps,
  opened: Opened,
  trust: Trust,
  given: readonly ListedGrant[],
  vaults: readonly Vault[],
) => {
  const rings = vaults.map((v) => v.ring);
  const due = given.filter((g) => g.grant.scope === "view" && isBehind(g.grant, rings));
  for (const { grant } of due) {
    const grantee = certificateOf(trust, grant.grantee);
    // In the grant's order, each vault it names once more
    const named = grant.items.flatMap((item) =>
      rings.filter((r) => encodeBytes(r.vaultId) === encodeBytes(item.vaultId)),
    );
    if (!grantee || named.length !== grant.items.length) continue;
    const made = makeGrant(
      author(opened),
      grantee,
      { scope: "view", rings: named },
      {
        waitSeconds: grant.waitSeconds,
        time: Math.max(seconds(), grant.time + 1),
      },
    );
    await api.saveGrant(opened.token, made.grant, made.packages);
  }
  return due.length;
};
