/**
 * The app frame (DESIGN.md, Aufbau): rail and, from lg, the sidebar on the desktop; list and
 * detail side by side from md; on a phone one screen at a time with the tab bar at the bottom
 */
import { createToasts, type Locale, Toaster } from "@kennwort/ui";
import type { JSX } from "@solidjs/web";
import { Match, Show, Switch } from "solid-js";
import type { Navigation } from "../navigation.ts";
import { EntryDetail } from "./entry-detail.tsx";
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
                  <Sidebar nav={props.nav} vaults={props.vaults?.()} />
                  <main class="flex min-h-0 flex-1">
                    <EntryList
                      nav={props.nav}
                      filter={entries().filter}
                      selected={entries().entry}
                      vaults={props.vaults?.()}
                    />
                    <EntryDetail
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
                  <Sidebar nav={props.nav} vaults={props.vaults?.()} />
                  <main class="flex min-h-0 flex-1">{shown()}</main>
                </>
              )}
            </Show>
          )}
        </Match>
        <Match when={route().page === "generator"}>
          <main class="flex min-h-0 flex-1">
            <GeneratorPage />
          </main>
        </Match>
        <Match when={route().page === "groups"}>
          <main class="flex min-h-0 flex-1">
            <GroupsPage />
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
