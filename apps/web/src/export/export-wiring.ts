/**
 * What the export page (K-504) gets from the open account: who this account is in the company,
 * the vaults the device opened with their entries' content, and the signed audit event the server
 * has to take first (P-20). Kept out of app.tsx, which only passes it on.
 */
import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import type { RecoveryApi } from "@kennwort/client/session/recovery-api.ts";
import { encodeBytes, signAudit } from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";
import { m } from "@kennwort/ui";
import type { Session } from "../session/session.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import { download, mayExport } from "./export.ts";
import type { ExportPageDeps } from "./export-page.tsx";

/** This account in the company's members list, as the pinned root confirmed it */
export const meOf = (store: VaultStore, session: Session) => {
  const shown = store.shown();
  const id = session.opened()?.accountId;
  if (shown.state !== "ready" || !id) return undefined;
  return shown.people.find((p) => encodeBytes(p.accountId) === encodeBytes(id));
};

export const exportDeps = (
  api: Pick<RecoveryApi, "auditAction">,
  session: Session,
  store: VaultStore,
  stored: () => StoredEntry[],
): ExportPageDeps => ({
  allowed: () => mayExport(meOf(store, session)),
  vaults: () => {
    const shown = store.shown();
    if (shown.state !== "ready") return [];
    return shown.vaults.map((vault) => ({
      idText: vault.idText,
      name: vault.name ?? m.vaults_unnamed(),
      entries: stored()
        .filter((entry) => entry.vaultIdText === vault.idText)
        .map((entry) => entry.content),
    }));
  },
  audit: async (subject) => {
    const opened = session.opened();
    const companyId = meOf(store, session)?.certificate?.companyId;
    if (!opened || !companyId) return false;
    const event = {
      companyId: encodeBytes(companyId),
      actor: encodeBytes(opened.accountId),
      action: "export" as const,
      subject,
    };
    const signature = signAudit(opened.keyBlock.ed.secretKey, event);
    // Without the server (offline) there is no entry in the log, and so no export
    return api.auditAction(opened.token, event.action, subject, signature).catch(() => false);
  },
  save: (file) => download(file),
  now: () => Date.now(),
  newId: () => encodeBytes(randomBytes(16)),
});
