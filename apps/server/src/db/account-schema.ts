// The account's ciphertexts and public keys (K-303, docs/sicherheitsdesign.md P-01, P-03): the key
// block, AK under each way to unlock it, the account state with its counter, and the public bundle
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./schema.ts";

const bytes = (name: string) => blob(name, { mode: "buffer" }).notNull();

export const accountKeys = sqliteTable("account_keys", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id),
  xwingPublicKey: bytes("xwing_public_key"),
  edPublicKey: bytes("ed_public_key"),
  keyBlock: bytes("key_block"),
  unlockPassphrase: bytes("unlock_passphrase"),
  unlockRecovery: bytes("unlock_recovery"),
  state: bytes("state"),
  stateCounter: integer("state_counter").notNull(),
  /** The owner's certificate by the root key; members get theirs from an admin (K-304) */
  certificate: text("certificate"),
  /** An invited member's MAC over its bundle (P-08), until an admin's client has certified it */
  inviteMac: blob("invite_mac", { mode: "buffer" }),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * The company root key wrapped to an owner's or admin's certified bundle (K-304, P-07); only that
 * account's client can open it, and it takes it only if it is the root it pinned
 */
export const rootGrants = sqliteTable("root_grants", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id),
  wrapped: bytes("wrapped"),
  createdAt: integer("created_at").notNull(),
});

/**
 * Certificates of bundles an account has replaced (K-307 part e, P-12): kept so the logs and
 * records its old keys signed still verify; each client checks them under the root itself
 */
export const supersededCertificates = sqliteTable("superseded_certificates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  certificate: text("certificate").notNull(),
  supersededAt: integer("superseded_at").notNull(),
});
