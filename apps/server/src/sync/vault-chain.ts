/**
 * How the server keeps a vault's log whole (K-305, P-06): it runs the client's own check
 * (verifyLog) over the stored entries and the new one, with the company's root key and the
 * certificates it holds, so it stores nothing an honest client would reject. Whether to trust an
 * entry is still each client's check; this only keeps an honest server consistent.
 */
import {
  bytes,
  type Certificate,
  CertificateWire,
  encodeBytes,
  idKey,
  type LogEntry,
  LogEntryWire,
  type LogError,
  verifyLog,
} from "@kennwort/core";
import { asc, eq } from "drizzle-orm";
import { supersededOf } from "../account/rekey.ts";
import type { Db } from "../db/database.ts";
import { accountKeys, accounts, companies, vaultLog } from "../db/schema.ts";

type Member = { role: string; validUntil: number };

/** Who is in the vault by the stored entries, each of which passed verifyLog when it came */
export const membersOf = (entries: LogEntry[]) => {
  const members = new Map<string, Member>();
  for (const e of entries) {
    const id = encodeBytes(e.accountId);
    if (e.action === "remove") members.delete(id);
    else if (e.action !== "rotate") members.set(id, { role: e.role, validUntil: e.validUntil });
  }
  return members;
};

/** A member whose access has not run out, at a time in Unix seconds */
export const isCurrent = (member: Member | undefined, now: number) =>
  member !== undefined && (member.validUntil === 0 || member.validUntil > now);

const certificatesOf = (db: Db, companyId: string) => {
  const rows = db
    .select({ certificate: accountKeys.certificate })
    .from(accountKeys)
    .innerJoin(accounts, eq(accounts.id, accountKeys.accountId))
    .where(eq(accounts.companyId, companyId))
    .all();
  const certificates = new Map<string, Certificate>();
  for (const row of rows) {
    const parsed = row.certificate ? CertificateWire.safeParse(JSON.parse(row.certificate)) : null;
    if (parsed?.success) certificates.set(idKey(parsed.data.accountId), parsed.data);
  }
  return certificates;
};

/** Earlier certificates of the company's accounts that renewed their keys (P-12), by hex ID */
const historyOf = (db: Db, companyId: string) => {
  const ids = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.companyId, companyId))
    .all()
    .map((row) => row.id);
  const history = new Map<string, Certificate[]>();
  for (const [id, earlier] of supersededOf(db, ids)) {
    const parsed = earlier.flatMap((c) => {
      const certificate = CertificateWire.safeParse(c);
      return certificate.success ? [certificate.data] : [];
    });
    const account = bytes(16).safeParse(id);
    if (account.success) history.set(idKey(account.data), parsed);
  }
  return history;
};

const rootOf = (db: Db, companyId: string) => {
  const company = db.select().from(companies).where(eq(companies.id, companyId)).get();
  const root = bytes(32).safeParse(company?.rootPublicKey ?? "");
  return root.success ? root.data : undefined;
};

export type ChainRefusal = "forbidden" | "invalid";

/** Why the chain would not hold with this entry appended, by the client's own check */
export const chainRefusal = (
  db: Db,
  companyId: string,
  vaultId: Uint8Array,
  entries: LogEntry[],
  now: number,
): ChainRefusal | undefined => {
  const rootPublicKey = rootOf(db, companyId);
  if (!rootPublicKey) return "invalid";
  const trust = {
    rootPublicKey,
    certificates: certificatesOf(db, companyId),
    history: historyOf(db, companyId),
    // verifyLog allows the same clock skew (CLOCK_SKEW_SECONDS) as every client
    now,
  };
  const checked = verifyLog(vaultId, entries, trust);
  if (checked.ok) return undefined;
  const forbidden: LogError[] = ["not-manager", "uncertified-signer"];
  return forbidden.includes(checked.error) ? "forbidden" : "invalid";
};

/** The stored log of a vault, entry by entry */
export const storedEntries = (db: Db, vaultId: string) =>
  db
    .select()
    .from(vaultLog)
    .where(eq(vaultLog.vaultId, vaultId))
    .orderBy(asc(vaultLog.seq))
    .all()
    .map((row) => LogEntryWire.parse(JSON.parse(row.entry)));

/** The accounts that are current members of a vault by its stored log, at a time in Unix seconds */
export const currentMembers = (db: Db, vaultId: string, now: number) => {
  const members = membersOf(storedEntries(db, vaultId));
  return new Map([...members].filter(([, member]) => isCurrent(member, now)));
};

/** The epoch of the stored log's newest entry: records are written in it only (P-11) */
export const currentEpoch = (db: Db, vaultId: string) =>
  storedEntries(db, vaultId).at(-1)?.epoch ?? 0;
