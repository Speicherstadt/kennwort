// The tables Better Auth needs (user, session, account, verification and the passkey plugin's
// passkey), as its Drizzle adapter reads them, plus Kennwort's own sign-in tables. Prefixed auth_ so
// that Better Auth's "account" (a sign-in method) is never confused with Kennwort's accounts.
import { blob, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const authUser = sqliteTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  companyId: text("company_id").notNull(),
  ...timestamps,
});

export const authSession = sqliteTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("auth_session_user").on(table.userId)],
);

export const authAccount = sqliteTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
});

export const authVerification = sqliteTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
});

export const authPasskey = sqliteTable(
  "auth_passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    transports: text("transports"),
    aaguid: text("aaguid"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("auth_passkey_user").on(table.userId),
    index("auth_passkey_credential").on(table.credentialID),
  ],
);

/**
 * The notweg sign-in key (P-02): an Ed25519 public key derived on the device from passphrase and
 * Secret Key; the server stores the key and the account salt, never anything to guess from. Next
 * to it the public key the Recovery Key gives (P-12), set when the account uploads its keys.
 */
export const loginKeys = sqliteTable("login_keys", {
  accountId: text("account_id").primaryKey(),
  publicKey: text("public_key").notNull(),
  accountSalt: text("account_salt").notNull(),
  recoveryPublicKey: text("recovery_public_key"),
  createdAt: integer("created_at").notNull(),
});

/** One-time challenges for a sign-in key, valid for two minutes; `way` names which key answers */
export const loginChallenges = sqliteTable("login_challenges", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  way: text("way", { enum: ["passphrase", "recovery"] })
    .notNull()
    .default("passphrase"),
  challenge: text("challenge").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

/** Failed sign-ins per account, for the lockout */
export const loginFailures = sqliteTable(
  "login_failures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: text("account_id").notNull(),
    at: integer("at").notNull(),
  },
  (table) => [index("login_failures_account").on(table.accountId, table.at)],
);

/** Invitation links (P-08); the server keeps only a hash of the token, never the link's secret */
export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  createdBy: text("created_by").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  acceptedAt: integer("accepted_at"),
  accountId: text("account_id"),
  /** The invitation secret sealed under the creator's AK (P-08); the server cannot open it */
  sealedSecret: blob("sealed_secret", { mode: "buffer" }),
  /** Who the invitation is for, as the inviting admin typed it; a label, never checked */
  label: text("label"),
});

/**
 * Adding a device (P-04): the new device's one-time public key, a hash of its poll token, and once
 * an unlocked device of an account answers, that account and the wrapped package. Only after that
 * device confirms the comparison code does the new device get a session; ten minutes at most.
 */
export const pairings = sqliteTable("pairings", {
  id: text("id").primaryKey(),
  publicKey: blob("public_key", { mode: "buffer" }).notNull(),
  pollHash: text("poll_hash").notNull(),
  /** Whose session the confirmation gives: the answering account, or the member it recovers (P-13) */
  accountId: text("account_id"),
  /** Who answered and alone may confirm; the owner when it recovers a member (K-307 part c) */
  answeredBy: text("answered_by"),
  package: blob("package", { mode: "buffer" }),
  confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
  expiresAt: integer("expires_at").notNull(),
});

/**
 * Which device a session belongs to (K-303, device list): the device sends its random ID and a
 * name at every sign-in; one session per device and account, a new one replaces the old.
 */
export const deviceSessions = sqliteTable(
  "device_sessions",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => authSession.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    deviceId: text("device_id").notNull(),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull(),
    /** Every request with the session moves it; Better Auth's updatedAt moves once a day only */
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (table) => [index("device_sessions_device").on(table.accountId, table.deviceId)],
);
