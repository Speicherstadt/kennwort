/**
 * The app frame (DESIGN.md, Aufbau): rail and, from lg, the sidebar on the desktop; list and
 * detail side by side from md; on a phone one screen at a time with the tab bar at the bottom
 */

import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { createToasts, type Locale, Toaster, type Toasts } from "@kennwort/ui";
import type { JSX } from "@solidjs/web";
import { Match, Show, Switch } from "solid-js";
import type { Navigation } from "../navigation.ts";
import { EntryDetail } from "./entry-detail.tsx";
import type { Saved } from "./entry-detail-parts.tsx";
import { EntryList, type ShownVault } from "./entry-list.tsx";
import { GeneratorPage, GroupsPage, NotFoundPage, SettingsPage } from "./pages.tsx";
import { Rail } from "./rail.tsx";
import { Sidebar } from "./sidebar.tsx";
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
  /** Konto → Notfallzugriff (K-307 part d); the app passes it with session, API and vaults */
  emergencyPage?: ((toasts: Toasts) => JSX.Element) | undefined;
  /** The company's groups (K-305 part 5); the demo's stand in where the app gives none */
  groupsPage?: (() => JSX.Element) | undefined;
  /** The entries from the vaults (K-306) and what list and detail do with them */
  entries?: (() => ShownEntry[] | undefined) | undefined;
  vaultName?: ((id: string) => string) | undefined;
  onNewEntry?: (() => void) | undefined;
  onEditEntry?: ((entry: ShownEntry) => void) | undefined;
  onShareEntry?: ((entry: ShownEntry) => void) | undefined;
  onFavoriteEntry?: ((entry: ShownEntry) => Promise<Saved>) | undefined;
  /** A vault link this account cannot open: what shows instead of its entries (K-305) */
  noAccess?: ((vaultId: string) => JSX.Element | undefined) | undefined;
}) => {
  const toasts = createToasts();
  const route = () => props.nav.route();
  return (
    <div class="flex h-dvh flex-col md:flex-row">
      <Rail nav={props.nav} onLock={props.onLock} />
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
                  <Sidebar nav={props.nav} vaults={props.vaults?.()} entries={props.entries?.()} />
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
                  <Sidebar nav={props.nav} vaults={props.vaults?.()} entries={props.entries?.()} />
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
              onEmergency={props.emergencyPage ? () => props.nav.go("/emergency") : undefined}
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
        <Match when={route().page === "emergency" && props.emergencyPage}>
          <main class="flex min-h-0 flex-1">{props.emergencyPage?.(toasts)}</main>
        </Match>
        <Match when={route().page === "not-found"}>
          <main class="flex min-h-0 flex-1">
            <NotFoundPage nav={props.nav} />
          </main>
        </Match>
      </Switch>
      <TabBar nav={props.nav} />
      <Toaster toasts={toasts} />
    </div>
  );
};
