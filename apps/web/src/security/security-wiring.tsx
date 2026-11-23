/**
 * What the security page (K-603) gets from the open account: the entries as „Zum Ändern“ marked
 * them, the leak check with its ranges in memory for as long as the account is open, the opt-in
 * and the report month from the sealed account state, and who may see the monthly report: owners
 * and admins, as for the export (export.ts, mayExport).
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import type { PwnedApi } from "@kennwort/client/session/pwned-api.ts";
import type { StateDeps } from "@kennwort/client/session/state-sync.ts";
import {
  type AccountState,
  createLeakCheck,
  leakCheckOn,
  monthOf,
  nextChoice,
  reportDue,
} from "@kennwort/core";
import { mayExport } from "../export/export.ts";
import { meOf } from "../export/export-wiring.ts";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import { createLeaks } from "./leaks.ts";
import { type SecurityDeps, SecurityPage } from "./security-page.tsx";

export type SecurityWiring = {
  api: PwnedApi & StateDeps;
  session: Session;
  nav: Navigation;
  store: VaultStore;
  entries: () => ShownEntry[] | undefined;
  vaultName: (id: string) => string;
  now?: () => number;
};

const update = (wiring: SecurityWiring) => async (change: (state: AccountState) => AccountState) =>
  (await wiring.session.updateState(wiring.api, change)).ok;

export const createSecurity = (wiring: SecurityWiring) => {
  const now = wiring.now ?? Date.now;
  const leaks = createLeaks(
    createLeakCheck((prefix) =>
      wiring.api.pwnedRange(wiring.session.opened()?.token ?? "", prefix),
    ),
  );
  const state = () => wiring.session.opened()?.state;
  const save = update(wiring);
  const deps: SecurityDeps = {
    nav: wiring.nav,
    entries: wiring.entries,
    vaultName: wiring.vaultName,
    leakCheckOn: () => {
      const current = state();
      return current !== undefined && leakCheckOn(current);
    },
    setLeakCheck: (on) =>
      save((current) => ({ ...current, leakCheck: nextChoice(current.leakCheck, on, now()) })),
    leaks,
    reportMonth: () => {
      const current = state();
      const due = current && reportDue(current.reportSeen, now());
      return due && mayExport(meOf(wiring.store, wiring.session)) ? monthOf(now()) : undefined;
    },
    onReportSeen: () => save((current) => ({ ...current, reportSeen: monthOf(now()) })),
  };
  return { page: () => <SecurityPage deps={deps} /> };
};
