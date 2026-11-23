/**
 * What the app shows: setting up a company and accepting an invitation are always reachable; the
 * rest only with an unlocked account, else the unlock screen, or the welcome on a new device (K-303).
 * Another language renders everything anew instead of reloading the page, which would lock it.
 */

import type { LinkApi } from "@kennwort/client/session/links-api.ts";
import { exitReport } from "@kennwort/core";
import { getLocale, type Locale, setLocale } from "@kennwort/ui";
import { QueryClientProvider } from "@tanstack/solid-query";
import { createMemo, createSignal, Match, onSettled, Show, Switch, untrack } from "solid-js";
import { AddDevicePage } from "./account/add-device-page.tsx";
import { InvitePage } from "./account/invite-page.tsx";
import { PairPage } from "./account/pair-page.tsx";
import { RecoverCompanyPage } from "./account/recover-company-page.tsx";
import { RecoverPage } from "./account/recover-page.tsx";
import { renewPage } from "./account/renew-route.tsx";
import { SetupPage } from "./account/setup-page.tsx";
import { readDeviceLink, UnlockPage, WelcomePage } from "./account/unlock-page.tsx";
import { devicesFor, emergencyPage, importPage, noAccessFor, OpenLink } from "./app-pages.tsx";
import { type AppApi, createStores } from "./app-stores.ts";
import { CompaniesPage } from "./companies/companies-page.tsx";
import { type CompanySwitcher, createCompanySwitch } from "./companies/company-switch.ts";
import { EmergencyNotice } from "./emergency/emergency-notice.tsx";
import { markToChange } from "./entries/to-change.ts";
import { ExportPage } from "./export/export-page.tsx";
import { Frame } from "./frame/frame.tsx";
import { GroupsPage } from "./groups/groups-page.tsx";
import { createHandover } from "./handover/handover-wiring.tsx";
import { createLabels } from "./labels/label-wiring.tsx";
import { SecretPage } from "./links/secret-page.tsx";
import type { MemberExits } from "./members/member-exit.tsx";
import { MembersPage } from "./members/members-page.tsx";
import type { Navigation, TakenFragment } from "./navigation.ts";
import { createNotifications } from "./notifications/notifications-wiring.tsx";
import type { LocalCopy } from "./offline/local-copy.ts";
import { OfflineNotice } from "./offline/offline-notice.tsx";
import { createOfflineView } from "./offline/offline-view.ts";
import { OidcPage } from "./oidc/oidc-page.tsx";
import { createOidcName } from "./oidc/sign-in-button.tsx";
import { ApplyPolicy } from "./policy/policy-section.tsx";
import { createAccountQueries } from "./queries.ts";
import { createSecurity } from "./security/security-wiring.tsx";
import type { Session } from "./session/session.ts";
import { RotationNotice } from "./vaults/rotation-notice.tsx";
import { namedMarks, peopleOf, vaultViews } from "./vaults/vault-views.ts";
import { VaultsPage } from "./vaults/vaults-page.tsx";

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
  switcher: CompanySwitcher;
}) => {
  const queries = createAccountQueries();
  const { entries, sharing, exits, store, exporting, links } = createStores(props);
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
  const security = createSecurity({ ...props, store, entries: allEntries, vaultName });
  const memberExits: MemberExits = {
    onLeft: reload,
    report: (accountId) => exitReport(accountId, entries.seen()),
    vaultName,
  };
  const Editor = entries.editor;
  const ShareDialog = sharing.dialog;
  const notifications = createNotifications(props, store);
  const handover = createHandover(props, {
    store,
    stored: entries.stored,
    saveImport: entries.saveImport,
  });
  const labels = createLabels();
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
        onLinkEntry={online(links.start)}
        onLabelEntry={labels.start}
        companies={props.switcher}
        companiesPage={() => (
          <CompaniesPage session={props.session} api={props.api} switcher={props.switcher} />
        )}
        linksPage={links.page}
        securityPage={security.page}
        noAccess={noAccessFor(props, store)}
        notifications={notifications}
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
            onHandOver={handover.possible() ? handover.open : undefined}
          />
        )}
        importPage={importPage(props.nav, store, allEntries, () => online(entries.saveImport))}
        exportPage={() => <ExportPage deps={exporting} />}
        canExport={exporting.allowed()}
        emergencyPage={emergencyPage(props, shownVaults)}
        renewPage={renewPage(props, store, reload)}
        devices={devicesFor(props)}
      />
      <Editor nav={props.nav} vaults={store} />
      <ShareDialog vaults={store} />
      {links.dialog()}
      {handover.startDialog()}
      {handover.finishDialog()}
      {labels.dialog()}
      <OfflineNotice offline={offline()} syncedAt={props.copy?.syncedAt()} />
      <RotationNotice vaults={shownVaults()} />
      <EmergencyNotice api={props.api} session={props.session} nav={props.nav} />
      {notifications.live()}
    </QueryClientProvider>
  );
};

/** The fragment meant for a page, empty for any other */
const hashFor = (shown: TakenFragment, page: TakenFragment["page"]) =>
  shown.page === page ? shown.hash : "";

/** A one-time link (K-601): no account, anew for every link taken; it fetches only on a click */
const secretRoute = (
  fetchId: string,
  link: () => TakenFragment,
  fetchLink: LinkApi["fetchLink"],
) => (
  <Show when={link()} keyed>
    {(shown) => (
      <SecretPage fetchId={fetchId} hash={hashFor(shown, "secret")} fetchLink={fetchLink} />
    )}
  </Show>
);

export const App = (props: {
  nav: Navigation;
  session: Session;
  api: AppApi;
  /** The fragment the app was opened with (takeStartFragment); later ones come from `nav` */
  hash: string;
  /** The device's offline copy (K-308 part b); without it the app needs the server */
  copy?: LocalCopy;
  /** A one-time link's fetch (K-601), made without the device's name; the API's own by default */
  fetchLink?: LinkApi["fetchLink"];
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
  const secret = () => {
    const r = route();
    return r.page === "secret" ? r : undefined;
  };
  // The switch between the companies of the account (K-605): outside the frame, which it rebuilds
  const switcher = createCompanySwitch(props.session.companies, props.nav);
  // The identity provider's name for the sign-in button (K-604), none without one
  const oidc = createOidcName(props.api);
  return (
    <Show when={locale()} keyed>
      {(_locale) => (
        <Switch>
          {/* Each secret page anew for every link taken, as its form reads the link once:
              the kit's link carries the Secret Key (P-12), the pairing link the pairing secret
              (P-04), the invitation its secret (P-08) */}
          <Match when={secret()}>
            {(r) => secretRoute(r().id, link, props.fetchLink ?? props.api.fetchLink)}
          </Match>
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
          <Match when={route().page === "open"}>
            <OpenLink nav={props.nav} />
          </Match>
          <Match when={route().page === "oidc"}>
            <Show when={link()} keyed>
              {(shown) => (
                <OidcPage
                  nav={props.nav}
                  session={props.session}
                  api={props.api}
                  hash={hashFor(shown, "oidc")}
                />
              )}
            </Show>
          </Match>
          <Match when={!props.session.opened()}>
            <Show
              when={props.session.device() || otherAccount()}
              fallback={
                <WelcomePage nav={props.nav} onUnlock={() => setOtherAccount(true)} oidc={oidc()} />
              }
            >
              <UnlockPage nav={props.nav} session={props.session} oidc={oidc()} />
            </Show>
          </Match>
          <Match when={props.session.opened()}>
            {/* Anew for each company on screen (K-605): its own stores, cache and policy; the
                offline copy is the home's only */}
            <Show when={props.session.companies.activeId()} keyed>
              {(_active) => {
                // Read once per company on screen: the frame is built anew for the next one
                const copy = untrack(() =>
                  props.session.companies.atHome() ? props.copy : undefined,
                );
                return (
                  <>
                    <ApplyPolicy session={props.session} api={props.api} />
                    <OpenedFrame
                      nav={props.nav}
                      session={props.session}
                      api={props.api}
                      copy={copy}
                      onLocale={changeLocale}
                      switcher={switcher}
                    />
                  </>
                );
              }}
            </Show>
          </Match>
        </Switch>
      )}
    </Show>
  );
};
