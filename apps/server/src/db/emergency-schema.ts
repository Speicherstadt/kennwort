// Emergency access (K-307 part d, docs/sicherheitsdesign.md P-14): the grant the grantor signed,
// its packages, which the server keeps back until the waiting time is over, and the statements of
// both sides. The server cannot open a package; it only decides when to hand them out.
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./schema.ts";

const account = (name: string) =>
  text(name)
    .notNull()
    .references(() => accounts.id);

/** One grant per grantor and grantee, as JSON the clients signed; a newer one replaces it */
export const emergencyGrants = sqliteTable(
  "emergency_grants",
  {
    grantor: account("grantor"),
    grantee: account("grantee"),
    grant: text("grant").notNull(),
    packages: text("packages").notNull(),
    /** The grant's signed time, seconds: an older grant does not replace a newer one */
    time: integer("time").notNull(),
    /** The grantee's signed request and when the server took it (ms): the waiting time starts */
    request: text("request"),
    requestedAt: integer("requested_at"),
    /** The grantor's signed objection to that request, or its early approval */
    objection: text("objection"),
    approval: text("approval"),
    /** When the packages first went out (ms) */
    releasedAt: integer("released_at"),
    storedAt: integer("stored_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.grantor, table.grantee] })],
);

/** The grantor's signed revocation of the newest grant to a grantee, for the grantee to see */
export const emergencyRevocations = sqliteTable(
  "emergency_revocations",
  {
    grantor: account("grantor"),
    grantee: account("grantee"),
    statement: text("statement").notNull(),
    storedAt: integer("stored_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.grantor, table.grantee] })],
);
