/**
 * The app frame (DESIGN.md, Aufbau): rail and, from lg, the sidebar on the desktop; list and
 * detail side by side from md; on a phone one screen at a time with the tab bar at the bottom
 */

import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { createToasts, type Locale, Toaster, type Toasts } from "@kennwort/ui";
import type { JSX } from "@solidjs/web";
import { Match, Show, Switch } from "solid-js";
import type { Navigation } from "../navigation.ts";
import type { FrameNotifications } from "../notifications/notifications-wiring.tsx";
import { EntryDetail } from "./entry-detail.tsx";
import type { Saved } from "./entry-detail-parts.tsx";
import { EntryList, type ShownVault } from "./entry-list.tsx";
import { GeneratorPage, GroupsPage, NotFoundPage, SettingsPage } from "./pages.tsx";
import { Rail } from "./rail.tsx";
import { type CompanySwitch, Sidebar } from "./sidebar.tsx";
import { TabBar } from "./tab-bar.tsx";

export const Frame = (props: {
  nav: Navigation;
  onLock: () => void;
  onLocale: (locale: Locale) => void;
  onAddDevice: () => void;
  /** The device list in the settings (K-303); the app passes it with the session's token */
  devices?: (() => JSX.Element) | undefined;
  /** The members page (K-304); the app passes it with session and API */
  members?: (() => JSX.Element) | undefined;
  /** The vaults the app loaded and their page (K-305) */
  vaults?: (() => ShownVault[] | undefined) | undefined;
  vaultsPage?: (() => JSX.Element) | undefined;
  /** The import (K-501); the app passes it with the vaults and the entry store */
  importPage?: (() => JSX.Element) | undefined;
  /** The export (K-504); the settings offer it only to owners and admins (`canExport`) */
  exportPage?: (() => JSX.Element) | undefined;
  canExport?: boolean | undefined;
  /** Konto → Notfallzugriff (K-307 part d); the app passes it with session, API and vaults */
  emergencyPage?: ((toasts: Toasts) => JSX.Element) | undefined;
  /** Konto → Schlüssel erneuern (K-307 part e); the app passes it with session, API and vaults */
  renewPage?: (() => JSX.Element) | undefined;
  /** The company's groups (K-305 part 5); the demo's stand in where the app gives none */
  groupsPage?: (() => JSX.Element) | undefined;
  /** The entries from the vaults (K-306) and what list and detail do with them */
  entries?: (() => ShownEntry[] | undefined) | undefined;
  vaultName?: ((id: string) => string) | undefined;
  onNewEntry?: (() => void) | undefined;
  onEditEntry?: ((entry: ShownEntry) => void) | undefined;
  onShareEntry?: ((entry: ShownEntry) => void) | undefined;
  /** A one-time link to an entry for someone without an account (K-601) */
  onLinkEntry?: ((entry: ShownEntry) => void) | undefined;
  /** A QR label for the device an entry is for (K-605) */
  onLabelEntry?: ((entry: ShownEntry) => void) | undefined;
  /** The companies of the account and the switch between them (K-605), for the sidebar */
  companies?: CompanySwitch | undefined;
  /** Einstellungen → „Firmen“ (K-605) */
  companiesPage?: (() => JSX.Element) | undefined;
  /** Einstellungen → „Einmal-Links“ (K-601): a link for a free text and the account's links */
  linksPage?: (() => JSX.Element) | undefined;
  /** „Sicherheit“ (K-603): weak, reused and leaked passwords and the monthly report */
  securityPage?: (() => JSX.Element) | undefined;
  onFavoriteEntry?: ((entry: ShownEntry) => Promise<Saved>) | undefined;
  /** A vault link this account cannot open: what shows instead of its entries (K-305) */
  noAccess?: ((vaultId: string) => JSX.Element | undefined) | undefined;
  /** The bell and the page of the notifications (K-602) */
  notifications?: FrameNotifications | undefined;
}) => {
  const toasts = createToasts();
  const route = () => props.nav.route();
  return (
    <div class="flex h-dvh flex-col md:flex-row">
      <Rail
        nav={props.nav}
        onLock={props.onLock}
        bell={props.notifications ? () => props.notifications?.bell("rail") : undefined}
      />
      <Switch>
        <Match
          when={(() => {
            const r = route();
            return r.page === "entries" ? r : undefined;
          })()}
        >
          {(entries) => (
            <Show
              when={(() => {
                const f = entries().filter;
                return f.kind === "vault" ? props.noAccess?.(f.id) : undefined;
              })()}
              fallback={
                <>
                  <Sidebar
                    nav={props.nav}
                    vaults={props.vaults?.()}
                    entries={props.entries?.()}
                    security={Boolean(props.securityPage)}
                    companies={props.companies}
                  />
                  <main class="flex min-h-0 flex-1">
                    <EntryList
                      entries={props.entries?.()}
                      onNew={props.onNewEntry}
                      nav={props.nav}
                      filter={entries().filter}
                      selected={entries().entry}
                      vaults={props.vaults?.()}
                    />
                    <EntryDetail
                      entries={props.entries?.()}
                      vaultName={props.vaultName}
                      onEdit={props.onEditEntry}
                      onShare={props.onShareEntry}
                      onLink={props.onLinkEntry}
                      onLabel={props.onLabelEntry}
                      onFavorite={props.onFavoriteEntry}
                      nav={props.nav}
                      filter={entries().filter}
                      selected={entries().entry}
                      toasts={toasts}
                    />
                  </main>
                </>
              }
            >
              {(shown) => (
                <>
                  <Sidebar
                    nav={props.nav}
                    vaults={props.vaults?.()}
                    entries={props.entries?.()}
                    companies={props.companies}
                  />
                  <main class="flex min-h-0 flex-1">{shown()}</main>
                </>
              )}
            </Show>
          )}
        </Match>
        <Match when={route().page === "generator"}>
          <main class="flex min-h-0 flex-1">
            <GeneratorPage toasts={toasts} />
          </main>
        </Match>
        <Match when={route().page === "groups"}>
          <main class="flex min-h-0 flex-1">
            {props.groupsPage ? props.groupsPage() : <GroupsPage />}
          </main>
        </Match>
        <Match when={route().page === "settings"}>
          <main class="flex min-h-0 flex-1">
            <SettingsPage
              onLock={props.onLock}
              onLocale={props.onLocale}
              onAddDevice={props.onAddDevice}
              onMembers={props.members ? () => props.nav.go("/members") : undefined}
              onVaults={props.vaultsPage ? () => props.nav.go("/vaults") : undefined}
              onImport={props.importPage ? () => props.nav.go("/import") : undefined}
              onExport={
                props.exportPage && props.canExport ? () => props.nav.go("/export") : undefined
              }
              onEmergency={props.emergencyPage ? () => props.nav.go("/emergency") : undefined}
              onLinks={props.linksPage ? () => props.nav.go("/links") : undefined}
              onSecurity={props.securityPage ? () => props.nav.go("/security") : undefined}
              onRenew={props.renewPage ? () => props.nav.go("/renew") : undefined}
              onCompanies={props.companiesPage ? () => props.nav.go("/companies") : undefined}
              devices={props.devices}
            />
          </main>
        </Match>
        <Match when={route().page === "members" && props.members}>
          <main class="flex min-h-0 flex-1">{props.members?.()}</main>
        </Match>
        <Match when={route().page === "vaults" && props.vaultsPage}>
          <main class="flex min-h-0 flex-1">{props.vaultsPage?.()}</main>
        </Match>
        <Match when={route().page === "import" && props.importPage}>
          <main class="flex min-h-0 flex-1">{props.importPage?.()}</main>
        </Match>
        <Match when={route().page === "export" && props.exportPage}>
          <main class="flex min-h-0 flex-1">{props.exportPage?.()}</main>
        </Match>
        <Match when={route().page === "emergency" && props.emergencyPage}>
          <main class="flex min-h-0 flex-1">{props.emergencyPage?.(toasts)}</main>
        </Match>
        <Match when={route().page === "links" && props.linksPage}>
          <main class="flex min-h-0 flex-1">{props.linksPage?.()}</main>
        </Match>
        <Match when={route().page === "notifications" && props.notifications}>
          <main class="flex min-h-0 flex-1">{props.notifications?.page()}</main>
        </Match>
        <Match when={route().page === "security" && props.securityPage}>
          <main class="flex min-h-0 flex-1">{props.securityPage?.()}</main>
        </Match>
        <Match when={route().page === "companies" && props.companiesPage}>
          <main class="flex min-h-0 flex-1">{props.companiesPage?.()}</main>
        </Match>
        <Match when={route().page === "renew" && props.renewPage}>
          <main class="flex min-h-0 flex-1">{props.renewPage?.()}</main>
        </Match>
        <Match when={route().page === "not-found"}>
          <main class="flex min-h-0 flex-1">
            <NotFoundPage nav={props.nav} />
          </main>
        </Match>
      </Switch>
      <TabBar
        nav={props.nav}
        bell={props.notifications ? () => props.notifications?.bell("tab") : undefined}
      />
      <Toaster toasts={toasts} />
    </div>
  );
};
