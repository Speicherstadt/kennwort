/**
 * What the server keeps of a login with OpenID Connect (K-604): the flow under way (state, nonce,
 * PKCE verifier, bound to a cookie), the ticket a finished login leaves for the app, and which
 * account a person of the provider is. Secrets are kept as SHA-256 hashes only, each taken once.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { encodeBytes } from "@kennwort/core";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { accounts, oidcCompanies, oidcFlows, oidcIdentities, oidcTickets } from "../db/schema.ts";

export const FLOW_MS = 10 * 60 * 1000;
/** The app redeems its ticket right after the redirect; an enrolment takes a few minutes more */
export const TICKET_MS = 15 * 60 * 1000;

export const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");
const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const randomText = (random: (length: number) => Uint8Array) => encodeBytes(random(32));

/** PKCE (RFC 7636 §4.2): the S256 challenge of a verifier */
export const challengeOf = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

export type NewFlow = {
  state: string;
  binding: string;
  nonce: string;
  verifier: string;
  companyId: string | null;
  linkAccount: string | null;
};

export const saveFlow = (db: Db, flow: NewFlow, now: number) => {
  db.delete(oidcFlows).where(lt(oidcFlows.expiresAt, now)).run();
  db.insert(oidcFlows)
    .values({
      stateHash: hashOf(flow.state),
      bindingHash: hashOf(flow.binding),
      nonce: flow.nonce,
      verifier: flow.verifier,
      companyId: flow.companyId,
      linkAccount: flow.linkAccount,
      expiresAt: now + FLOW_MS,
    })
    .run();
};

/**
 * The flow of a callback, taken in one statement so a replayed callback finds nothing; only from
 * the browser that started it (its cookie) and only within ten minutes
 */
export const takeFlow = (db: Db, state: string, binding: string | undefined, now: number) => {
  const flow = db
    .delete(oidcFlows)
    .where(and(eq(oidcFlows.stateHash, hashOf(state)), gt(oidcFlows.expiresAt, now)))
    .returning()
    .get();
  if (!flow || !binding || !sameHash(flow.bindingHash, hashOf(binding))) return undefined;
  return flow;
};

export type TicketData = {
  issuer: string;
  subject: string;
  accountId: string | null;
  companyId: string | null;
  name: string | null;
  groups: string[];
};

export const saveTicket = (db: Db, ticket: string, data: TicketData, now: number) => {
  db.delete(oidcTickets).where(lt(oidcTickets.expiresAt, now)).run();
  db.insert(oidcTickets)
    .values({
      ticketHash: hashOf(ticket),
      ...data,
      groups: JSON.stringify(data.groups),
      expiresAt: now + TICKET_MS,
    })
    .run();
};

const toData = (row: typeof oidcTickets.$inferSelect): TicketData => ({
  issuer: row.issuer,
  subject: row.subject,
  accountId: row.accountId,
  companyId: row.companyId,
  name: row.name,
  groups: JSON.parse(row.groups) as string[],
});

/** A ticket still valid, without using it up (an enrolment shows its form first) */
export const peekTicket = (db: Db, ticket: string, now: number) => {
  const row = db
    .select()
    .from(oidcTickets)
    .where(and(eq(oidcTickets.ticketHash, hashOf(ticket)), gt(oidcTickets.expiresAt, now)))
    .get();
  return row ? toData(row) : undefined;
};

/** Uses a ticket up: of two requests with the same ticket only one gets it */
export const takeTicket = (db: Db, ticket: string, now: number) => {
  const row = db
    .delete(oidcTickets)
    .where(and(eq(oidcTickets.ticketHash, hashOf(ticket)), gt(oidcTickets.expiresAt, now)))
    .returning()
    .get();
  return row ? toData(row) : undefined;
};

/** The account a person of the provider is, by issuer and subject only */
export const accountOf = (db: Db, issuer: string, subject: string) =>
  db
    .select({ account: accounts })
    .from(oidcIdentities)
    .innerJoin(accounts, eq(accounts.id, oidcIdentities.accountId))
    .where(and(eq(oidcIdentities.issuer, issuer), eq(oidcIdentities.subject, subject)))
    .get()?.account;

export const identityOf = (db: Db, accountId: string) =>
  db.select().from(oidcIdentities).where(eq(oidcIdentities.accountId, accountId)).get();

/** Links once: false when the person or the account is linked already */
export const linkIdentity = (
  db: Db,
  accountId: string,
  issuer: string,
  subject: string,
  now: number,
) =>
  db
    .insert(oidcIdentities)
    .values({ accountId, issuer, subject, linkedAt: now })
    .onConflictDoNothing()
    .returning()
    .get() !== undefined;

export const enrolmentOpen = (db: Db, companyId: string) =>
  db.select().from(oidcCompanies).where(eq(oidcCompanies.companyId, companyId)).get() !== undefined;

/** The company a person without an account joins: the one asked for, or the only one open */
export const enrolmentCompany = (db: Db, asked: string | undefined) => {
  if (asked) return enrolmentOpen(db, asked) ? asked : undefined;
  const open = db.select().from(oidcCompanies).limit(2).all();
  return open.length === 1 ? open[0]?.companyId : undefined;
};
