/**
 * Who may sign an export into the audit log (K-504, P-19): owners and admins of the company, for
 * every vault or one vault of the company, as the subject names it. The export itself happens on
 * the device; the client builds the file only once the server took the event, so a member's
 * client gets no export it could hide from the log. A client that skips the server could still
 * decrypt what it can open: that is the limit of any check on the server (P-19, Restrisiko).
 */
import { parseExportSubject } from "@kennwort/core";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { vaults } from "../db/schema.ts";

export type ExportRefusal = "invalid" | "forbidden" | "not-found";

export const exportRefusal = (
  db: Db,
  who: { companyId: string; role: string | undefined },
  subject: string,
): ExportRefusal | undefined => {
  const parsed = parseExportSubject(subject);
  if (!parsed) return "invalid";
  if (who.role !== "owner" && who.role !== "admin") return "forbidden";
  if (parsed.scope.kind === "all") return undefined;
  const vault = db
    .select({ id: vaults.id })
    .from(vaults)
    .where(and(eq(vaults.companyId, who.companyId), eq(vaults.id, parsed.scope.vaultId)))
    .get();
  return vault ? undefined : "not-found";
};
