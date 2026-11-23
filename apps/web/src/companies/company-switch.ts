/**
 * The switch between the companies of the account (K-605): made once in the app, outside the frame,
 * since putting another company on screen builds the frame anew for its account (app.tsx). The
 * sidebar and the page „Firmen“ use the same one.
 */
import { m } from "@kennwort/ui";
import { createSignal } from "solid-js";
import type { Navigation } from "../navigation.ts";
import type { Companies } from "../session/companies.ts";
import type { SessionError } from "../session/session.ts";

export const createCompanySwitch = (companies: Companies, nav: Navigation) => {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<SessionError>();
  let running = false;
  /** Signs in to the company's account and shows its entries; false when that failed */
  const switchTo = async (accountId: string) => {
    if (running) return false;
    running = true;
    setBusy(true);
    setError(undefined);
    const done = await companies.switchTo(accountId);
    running = false;
    setBusy(false);
    if (!done.ok) setError(done.error);
    else nav.go("/entries");
    return done.ok;
  };
  return {
    /** Each company with the name the home gave it; the home is „Eigene Firma“ */
    options: () =>
      companies.companies().map((company) => ({
        id: company.accountId,
        name: company.name ?? m.companies_home(),
      })),
    activeId: companies.activeId,
    busy,
    error,
    switchTo,
    onSwitch: (accountId: string) => void switchTo(accountId),
  };
};

export type CompanySwitcher = ReturnType<typeof createCompanySwitch>;
