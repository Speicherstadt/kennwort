/**
 * The app frame (DESIGN.md, Aufbau): rail and, from lg, the sidebar on the desktop; list and
 * detail side by side from md; on a phone one screen at a time with the tab bar at the bottom
 */
import { createToasts, Toaster } from "@kennwort/ui";
import { Match, Switch } from "solid-js";
import type { Navigation } from "../navigation.ts";
import { EntryDetail } from "./entry-detail.tsx";
import { EntryList } from "./entry-list.tsx";
import { GeneratorPage, GroupsPage, NotFoundPage, SettingsPage } from "./pages.tsx";
import { Rail } from "./rail.tsx";
import { Sidebar } from "./sidebar.tsx";
import { TabBar } from "./tab-bar.tsx";

export const Frame = (props: { nav: Navigation; onLock: () => void }) => {
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
            <>
              <Sidebar nav={props.nav} />
              <main class="flex min-h-0 flex-1">
                <EntryList nav={props.nav} filter={entries().filter} selected={entries().entry} />
                <EntryDetail
                  nav={props.nav}
                  filter={entries().filter}
                  selected={entries().entry}
                  toasts={toasts}
                />
              </main>
            </>
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
            <SettingsPage onLock={props.onLock} />
          </main>
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
