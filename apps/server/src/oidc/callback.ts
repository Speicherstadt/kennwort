/**
 * The callback of a login with OpenID Connect (K-604, P-25): the flow by its state and cookie, the
 * code exchanged with the PKCE verifier, the ID token checked (jwt.ts), and then what it means for
 * the person: a linked account's groups, a link asked for by a signed-in account, or an enrolment
 * ticket. The account is found by issuer and `sub` only, never by an email address.
 */

import { eq } from "drizzle-orm";
import { recordAudit } from "../audit/store.ts";
import { accounts } from "../db/schema.ts";
import { noNotify } from "../notifications/notify.ts";
import { groupNames, syncGroups } from "./groups.ts";
import { verifyIdToken } from "./jwt.ts";
import type { OidcDeps } from "./routes.ts";
import { redirectUri } from "./routes.ts";
import {
  accountOf,
  identityOf,
  linkIdentity,
  randomText,
  renameIdentity,
  saveTicket,
  type TicketData,
  takeFlow,
} from "./store.ts";

export type LoginError =
  | "denied"
  | "state"
  | "provider"
  | "token"
  | "left"
  | "no-company"
  | "linked-elsewhere"
  | "already-linked";

type Outcome = { ok: true; ticket: string } | { ok: false; error: LoginError };

type Callback = {
  code: string | undefined;
  state: string | undefined;
  error: string | undefined;
  binding: string | undefined;
};

type Person = { issuer: string; subject: string; name: string | null; groups: string[] };

const issue = (deps: OidcDeps, data: TicketData): Outcome => {
  const ticket = randomText(deps.random);
  saveTicket(deps.db, ticket, data, deps.now());
  return { ok: true, ticket };
};

const accountById = (deps: OidcDeps, id: string) =>
  deps.db.select().from(accounts).where(eq(accounts.id, id)).get();

/** A signed-in account links itself to the person: once, and only to a person no one else is */
const link = (deps: OidcDeps, accountId: string, person: Person): Outcome => {
  const account = accountById(deps, accountId);
  if (!account || account.leftAt !== null) return { ok: false, error: "left" };
  const other = accountOf(deps.db, person.issuer, person.subject);
  if (other && other.id !== account.id) return { ok: false, error: "linked-elsewhere" };
  const own = identityOf(deps.db, account.id);
  if (own && (own.issuer !== person.issuer || own.subject !== person.subject))
    return { ok: false, error: "already-linked" };
  if (!own) {
    linkIdentity(deps.db, account.id, person, deps.now());
    recordAudit(deps.db, {
      companyId: account.companyId,
      time: deps.now(),
      actor: account.id,
      action: "oidc-linked",
      subject: account.id,
      signature: new Uint8Array(),
    });
  }
  return known(deps, account, person);
};

/** A known account: its groups follow the claim (as requests), and the ticket only names it */
const known = (
  deps: OidcDeps,
  account: { id: string; companyId: string; leftAt: number | null },
  person: Person,
): Outcome => {
  if (account.leftAt !== null) return { ok: false, error: "left" };
  renameIdentity(deps.db, account.id, person.name);
  syncGroups(
    { db: deps.db, now: deps.now, notify: deps.notify ?? noNotify },
    account,
    person.groups,
  );
  return issue(deps, { ...person, accountId: account.id, companyId: account.companyId });
};

export const completeLogin = async (deps: OidcDeps, callback: Callback): Promise<Outcome> => {
  if (callback.error || !callback.code) return { ok: false, error: "denied" };
  if (!callback.state) return { ok: false, error: "state" };
  const flow = takeFlow(deps.db, callback.state, callback.binding, deps.now());
  if (!flow) return { ok: false, error: "state" };
  const { provider } = deps;
  const idToken = await provider.exchange(
    callback.code,
    flow.verifier,
    redirectUri(deps.publicUrl),
  );
  if (!idToken) return { ok: false, error: "provider" };
  const checked = await verifyIdToken(idToken, provider.jwks, {
    issuer: provider.settings.issuer,
    clientId: provider.settings.clientId,
    nonce: flow.nonce,
    now: Math.floor(deps.now() / 1000),
  });
  if (!checked.ok) {
    // Why, for the operator; never the token or a claim
    deps.log("warn", "oidc id token refused", { reason: checked.error });
    return { ok: false, error: "token" };
  }
  const person: Person = {
    issuer: checked.value.issuer,
    subject: checked.value.subject,
    name: checked.value.name ?? null,
    groups: groupNames(checked.value.claims, provider.settings.groupsClaim),
  };
  if (flow.linkAccount) return link(deps, flow.linkAccount, person);
  const account = accountOf(deps.db, person.issuer, person.subject);
  if (account) return known(deps, account, person);
  if (!flow.companyId) return { ok: false, error: "no-company" };
  return issue(deps, { ...person, accountId: null, companyId: flow.companyId });
};
