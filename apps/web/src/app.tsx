/**
 * What the app shows: setting up a company and accepting an invitation are always reachable; the
 * rest only with an unlocked account, else the unlock screen, or the welcome on a new device (K-303).
 * Another language renders everything anew instead of reloading the page, which would lock it.
 */

import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { httpServerFor } from "@kennwort/client/entries/entry-store.ts";
import type { AccountApi, Api } from "@kennwort/client/session/api.ts";
import type { DevicesApi } from "@kennwort/client/session/devices-api.ts";
import type { EmergencyApi } from "@kennwort/client/session/emergency-api.ts";
import type { GroupApi } from "@kennwort/client/session/groups-api.ts";
import type { ShareApi } from "@kennwort/client/session/shares-api.ts";
import type { VaultApi } from "@kennwort/client/session/vaults-api.ts";
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { encodeBytes, exitReport, type MemberView } from "@kennwort/core";
import { getLocale, type Locale, m, setLocale, type Toasts } from "@kennwort/ui";
import { QueryClientProvider } from "@tanstack/solid-query";
import { createMemo, createSignal, Match, onSettled, Show, Switch, untrack } from "solid-js";
import { AddDevicePage } from "./account/add-device-page.tsx";
import { InvitePage } from "./account/invite-page.tsx";
import { type PairDeps, PairPage } from "./account/pair-page.tsx";
import { RecoverCompanyPage } from "./account/recover-company-page.tsx";
import { RecoverPage } from "./account/recover-page.tsx";
import { renewPage } from "./account/renew-route.tsx";
import { SetupPage } from "./account/setup-page.tsx";
import { readDeviceLink, UnlockPage, WelcomePage } from "./account/unlock-page.tsx";
import { renewEmergency } from "./emergency/emergency.ts";
import { EmergencyNotice } from "./emergency/emergency-notice.tsx";
import { EmergencyPage } from "./emergency/emergency-page.tsx";
import { createEntries, writableVaults } from "./entries/entries-wiring.tsx";
import { markToChange } from "./entries/to-change.ts";
import { ExportPage } from "./export/export-page.tsx";
import { exportDeps } from "./export/export-wiring.ts";
import { DevicesSection } from "./frame/devices-section.tsx";
import { Frame } from "./frame/frame.tsx";
import { GroupsPage } from "./groups/groups-page.tsx";
import { type ImportDeps, ImportPage } from "./import/import-page.tsx";
import type { MemberExits } from "./members/member-exit.tsx";
import type { MembersDeps } from "./members/members.ts";
import { MembersPage } from "./members/members-page.tsx";
import type { Navigation, TakenFragment } from "./navigation.ts";
import type { LocalCopy } from "./offline/local-copy.ts";
import { OfflineNotice } from "./offline/offline-notice.tsx";
import { createOfflineView } from "./offline/offline-view.ts";
import { ApplyPolicy } from "./policy/policy-section.tsx";
import { createAccountQueries } from "./queries.ts";
import type { Session } from "./session/session.ts";
import { createSharing } from "./shares/shares-wiring.tsx";
import { createExits } from "./vaults/exit.ts";
import { NoAccess } from "./vaults/no-access.tsx";
import { RotationNotice } from "./vaults/rotation-notice.tsx";
import { requestAccess, vaultIdOf } from "./vaults/vault-members.ts";
import { createVaultStore, type VaultStore } from "./vaults/vault-store.ts";
import { VaultsPage } from "./vaults/vaults-page.tsx";

export type AppApi = PairDeps &
  DevicesApi &
  MembersDeps &
  VaultApi &
  GroupApi &
  ShareApi &
  EmergencyApi &
  Pick<AccountApi, "replaceUnlock"> &
  Pick<Api, "rekey"> & { syncFetch: typeof fetch };

/** The company's people as the vaults' load checked them; none before it */
const peopleOf = (store: VaultStore) => {
  const shown = store.shown();
  return shown.state === "ready" ? shown.people : [];
};

/** What the frame shows of the vaults: their names, and whether a new entry has a vault to go to */
const vaultViews = (store: VaultStore) => {
  /** A new entry needs a vault this account may write in, loaded, with no rotation due (P-11) */
  const canWrite = () => {
    const shown = store.shown();
    return (
      shown.state === "ready" && shown.vaults.some((v) => v.role !== "read" && !v.log.rotationDue)
    );
  };
  const vaultName = (id: string) => {
    const shown = store.shown();
    const vault = shown.state === "ready" ? shown.vaults.find((v) => v.idText === id) : undefined;
    return vault?.name ?? m.vaults_unnamed();
  };
  const shownVaults = () => {
    const shown = store.shown();
    return shown.state === "ready" ? shown.vaults : undefined;
  };
  return { canWrite, vaultName, shownVaults };
};

/** The names of whom the change marks name, from the company's members list (K-307) */
const namedMarks = (entries: ShownEntry[], people: MemberView[]) =>
  entries.map((entry) =>
    entry.marks?.length
      ? {
          ...entry,
          marks: entry.marks.map((mark) => ({
            ...mark,
            name: people.find((p) => encodeBytes(p.accountId) === mark.account)?.name ?? null,
          })),
        }
      : entry,
  );

/** The import (K-501) with where it may write, what is there already, and the write */
const importPage =
  (nav: Navigation, store: VaultStore, entries: () => ShownEntry[], save: ImportDeps["save"]) =>
  () => {
    const deps: ImportDeps = {
      vaults: () => writableVaults(store),
      existing: (vaultIdText) => entries().filter((e) => e.vault === vaultIdText),
      save,
    };
    return <ImportPage nav={nav} deps={deps} />;
  };

/** Konto → Notfallzugriff (K-307 part d) with the vaults it may grant and the frame's toasts */
const emergencyPage =
  (props: { api: AppApi; session: Session }, vaults: () => Vault[] | undefined) =>
  (toasts: Toasts) => (
    <EmergencyPage api={props.api} session={props.session} vaults={vaults} toasts={toasts} />
  );

/**
 * The stores of an open account: the vaults, their entries, the shares, the exits and the export.
 * Every load of the vaults loads their entries and shares; then a manager's client catches up on
 * what its vaults owe since someone left (K-307, P-11), without holding up the load.
 */
const createStores = (props: { session: Session; api: AppApi; copy: LocalCopy | undefined }) => {
  const entries = createEntries(httpServerFor(props.api.syncFetch), props.session, props.copy);
  const sharing = createSharing(props.api, props.session, entries.keys);
  const exits = createExits(
    { api: props.api, session: props.session },
    { reload: () => store.reload(), rotate: entries.rotate, behind: entries.behind },
  );
  const store: VaultStore = createVaultStore(props.api, props.session, async (loaded) => {
    await Promise.all([entries.load(loaded.vaults, loaded.trust), sharing.load(loaded)]);
    // Not awaited: the catch-up reloads itself, and waits for an exit that runs (createExits)
    void exits.catchUp(loaded);
    // Emergency grants behind a key rotation are made anew with the current keys (P-14)
    void renewEmergency(props.api, props.session, loaded);
  });
  // The export (K-504) reads the vaults and their entries' content as loaded
  const exporting = exportDeps(props.api, props.session, store, entries.stored);
  return { entries, sharing, exits, store, exporting };
};

/**
 * The vaults while the account is open: loaded when it opens, gone when it locks. So is the cache
 * of what the pages loaded from the server (queries.ts): it lives with the frame, never longer.
 * Without the server the app reads from the offline copy (K-308 part b): it says so, offers no
 * change, and loads anew once the server answers. After every load a manager's client catches up
 * on what its vaults owe since someone left (K-307, P-11).
 */
const OpenedFrame = (props: {
  nav: Navigation;
  session: Session;
  api: AppApi;
  copy: LocalCopy | undefined;
  onLocale: (next: Locale) => void;
}) => {
  const queries = createAccountQueries();
  const { entries, sharing, exits, store, exporting } = createStores(props);
  // Loaded once the frame is on screen: an effect's compute would load anew on every change of the
  // account state, and the frame lives only as long as the account is open
  onSettled(() => void store.reload());
  const reload = () => store.reload().then(() => undefined);
  const { offline, online } = createOfflineView(() => props.copy, props.session, reload);
  const { canWrite, vaultName, shownVaults } = vaultViews(store);
  /** Every entry this account sees, marked „Zum Ändern“ against all of them (K-306 part 5) */
  const allEntries = createMemo(() =>
    markToChange(namedMarks([...entries.entries(), ...sharing.entries()], peopleOf(store))),
  );
  const memberExits: MemberExits = {
    onLeft: reload,
    report: (accountId) => exitReport(accountId, entries.seen()),
    vaultName,
  };
  const Editor = entries.editor;
  const ShareDialog = sharing.dialog;
  return (
    <QueryClientProvider client={queries}>
      <Frame
        nav={props.nav}
        onLock={() => props.session.lock()}
        onLocale={props.onLocale}
        onAddDevice={() => props.nav.go("/link")}
        members={() => (
          <MembersPage
            session={props.session}
            api={props.api}
            origin={location.origin}
            exits={memberExits}
          />
        )}
        vaults={shownVaults}
        entries={allEntries}
        vaultName={vaultName}
        onNewEntry={canWrite() ? online(entries.startNew) : undefined}
        onEditEntry={online(entries.startChange)}
        onFavoriteEntry={online(entries.toggleFavorite)}
        onShareEntry={online(sharing.start)}
        noAccess={(vaultId) => {
          const shown = store.shown();
          // A vault refused for any reason but a time run out is this account's: no "no access" then
          const known =
            shown.state !== "ready" ||
            shown.vaults.some((v) => v.idText === vaultId) ||
            shown.refused.some((r) => r.idText === vaultId && r.error !== "expired");
          const id = vaultIdOf(vaultId);
          if (known || !id) return undefined;
          return <NoAccess onRequest={() => requestAccess(props.api, props.session, id)} />;
        }}
        groupsPage={() => (
          <GroupsPage
            api={props.api}
            session={props.session}
            people={() => {
              const shown = store.shown();
              return shown.state === "ready" ? shown.people : undefined;
            }}
          />
        )}
        vaultsPage={() => (
          <VaultsPage
            nav={props.nav}
            store={store}
            api={props.api}
            session={props.session}
            onRemove={exits.remove}
          />
        )}
        importPage={importPage(props.nav, store, allEntries, () => online(entries.saveNew))}
        exportPage={() => <ExportPage deps={exporting} />}
        canExport={exporting.allowed()}
        emergencyPage={emergencyPage(props, shownVaults)}
        renewPage={renewPage(props, store, reload)}
        devices={() => (
          <Show when={props.session.opened()?.token}>
            {(token) => (
              <DevicesSection
                token={token()}
                api={props.api}
                onSignedOut={() => {
                  props.session.forget();
                  props.nav.replace("/entries");
                }}
              />
            )}
          </Show>
        )}
      />
      <Editor nav={props.nav} vaults={store} />
      <ShareDialog vaults={store} />
      <OfflineNotice offline={offline()} syncedAt={props.copy?.syncedAt()} />
      <RotationNotice vaults={shownVaults()} />
      <EmergencyNotice api={props.api} session={props.session} nav={props.nav} />
    </QueryClientProvider>
  );
};

export const App = (props: {
  nav: Navigation;
  session: Session;
  api: AppApi;
  /** The fragment the app was opened with (takeStartFragment); later ones come from `nav` */
  hash: string;
  /** The device's offline copy (K-308 part b); without it the app needs the server */
  copy?: LocalCopy;
}) => {
  const [otherAccount, setOtherAccount] = createSignal(false);
  const [locale, setShownLocale] = createSignal(getLocale());
  const changeLocale = (next: Locale) => {
    setLocale(next, { reload: false });
    document.documentElement.lang = next;
    setShownLocale(next);
  };
  const route = () => props.nav.route();
  // The last secret fragment and the page it is for: first the one the app was opened with
  // (takeStartFragment has already dropped it from the address), then each one a link opened in
  // the same tab brings (navigation.onFragment). Deliberately read once: the page the app was
  // opened on decides what that fragment is. The path is a plain signal, never async.
  const [link, setLink] = createSignal<TakenFragment>({
    page: untrack(() => route().page),
    hash: untrack(() => props.hash),
  });
  onSettled(() => props.nav.onFragment((taken) => setLink(taken)));
  /** The fragment meant for a page, empty for any other */
  const hashFor = (shown: TakenFragment, page: TakenFragment["page"]) =>
    shown.page === page ? shown.hash : "";
  // Every key press or click pushes the automatic lock back (P-03); added once the app is on
  // screen and removed with it
  onSettled(() => {
    const touch = () => props.session.touch();
    document.addEventListener("pointerdown", touch);
    document.addEventListener("keydown", touch);
    return () => {
      document.removeEventListener("pointerdown", touch);
      document.removeEventListener("keydown", touch);
    };
  });
  const invite = () => {
    const r = route();
    return r.page === "invite" ? r : undefined;
  };
  return (
    <Show when={locale()} keyed>
      {(_locale) => (
        <Switch>
          {/* Each secret page anew for every link taken, as its form reads the link once:
              the kit's link carries the Secret Key (P-12), the pairing link the pairing secret
              (P-04), the invitation its secret (P-08) */}
          <Match when={route().page === "unlock"}>
            <Show when={link()} keyed>
              {(shown) => (
                <UnlockPage
                  nav={props.nav}
                  session={props.session}
                  link={readDeviceLink(hashFor(shown, "unlock"))}
                  onUnlocked={() => props.nav.replace("/entries")}
                />
              )}
            </Show>
          </Match>
          <Match when={route().page === "recover"}>
            <RecoverPage nav={props.nav} session={props.session} />
          </Match>
          <Match when={route().page === "recover-company"}>
            <RecoverCompanyPage nav={props.nav} session={props.session} api={props.api} />
          </Match>
          <Match when={route().page === "pair"}>
            <PairPage nav={props.nav} session={props.session} api={props.api} />
          </Match>
          <Match when={route().page === "link" && props.session.opened()}>
            <Show when={link()} keyed>
              {(shown) => (
                <AddDevicePage
                  nav={props.nav}
                  session={props.session}
                  api={props.api}
                  link={hashFor(shown, "link") || undefined}
                />
              )}
            </Show>
          </Match>
          <Match when={route().page === "setup"}>
            <SetupPage nav={props.nav} session={props.session} />
          </Match>
          <Match when={invite()}>
            {(r) => (
              <Show when={link()} keyed>
                {(shown) => (
                  <InvitePage
                    nav={props.nav}
                    session={props.session}
                    id={r().id}
                    hash={hashFor(shown, "invite")}
                  />
                )}
              </Show>
            )}
          </Match>
          <Match when={!props.session.opened()}>
            <Show
              when={props.session.device() || otherAccount()}
              fallback={<WelcomePage nav={props.nav} onUnlock={() => setOtherAccount(true)} />}
            >
              <UnlockPage nav={props.nav} session={props.session} />
            </Show>
          </Match>
          <Match when={props.session.opened()}>
            <ApplyPolicy session={props.session} api={props.api} />
            <OpenedFrame
              nav={props.nav}
              session={props.session}
              api={props.api}
              copy={props.copy}
              onLocale={changeLocale}
            />
          </Match>
        </Switch>
      )}
    </Show>
  );
};
