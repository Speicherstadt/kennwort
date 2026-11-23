// Sign-in with OpenID Connect (K-604, docs/sicherheitsdesign.md P-25): which companies take people
// from the identity provider, which account a person of the provider is, the logins under way and
// the one-time tickets that carry a finished login into the app. No key and no secret of a vault.
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { accounts, companies } from "./schema.ts";

/** A company whose owner or admin lets people of the provider ask to join (enrolment) */
export const oidcCompanies = sqliteTable("oidc_companies", {
  companyId: text("company_id")
    .primaryKey()
    .references(() => companies.id),
  enabledBy: text("enabled_by").notNull(),
  enabledAt: integer("enabled_at").notNull(),
});

/** The person of the provider an account is: by issuer and `sub` only, never by an email address */
export const oidcIdentities = sqliteTable(
  "oidc_identities",
  {
    accountId: text("account_id")
      .primaryKey()
      .references(() => accounts.id),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    linkedAt: integer("linked_at").notNull(),
  },
  (table) => [uniqueIndex("oidc_identities_subject").on(table.issuer, table.subject)],
);

/**
 * A login under way: by a hash of its state; the nonce and the PKCE verifier stay here, the browser
 * only holds a cookie whose hash must match (login CSRF). Taken once, gone after ten minutes.
 */
export const oidcFlows = sqliteTable(
  "oidc_flows",
  {
    stateHash: text("state_hash").primaryKey(),
    bindingHash: text("binding_hash").notNull(),
    nonce: text("nonce").notNull(),
    verifier: text("verifier").notNull(),
    /** The company someone who is no account yet asks to join */
    companyId: text("company_id"),
    /** A signed-in account that links itself to its person of the provider */
    linkAccount: text("link_account"),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("oidc_flows_expiry").on(table.expiresAt)],
);

/**
 * A finished login, handed to the app in the fragment of the address: for a known account a
 * session once, for an unknown person the enrolment. The provider's groups (names only) wait here
 * until the account exists.
 */
export const oidcTickets = sqliteTable(
  "oidc_tickets",
  {
    ticketHash: text("ticket_hash").primaryKey(),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    accountId: text("account_id"),
    companyId: text("company_id"),
    name: text("name"),
    groups: text("groups").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("oidc_tickets_expiry").on(table.expiresAt)],
);
