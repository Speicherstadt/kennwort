/**
 * Pages the open app hands to its frame with what they need from the stores (app.tsx): the import,
 * emergency access and the way to ask for access to a vault this account cannot open.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import type { Vault, VaultDeps } from "@kennwort/client/vaults/vaults.ts";
import type { Toasts } from "@kennwort/ui";
import { onSettled, Show } from "solid-js";
import { openTarget } from "./deep-link.ts";
import { EmergencyPage } from "./emergency/emergency-page.tsx";
import { writableVaults } from "./entries/entries-wiring.tsx";
import { DevicesSection } from "./frame/devices-section.tsx";
import { type ImportDeps, ImportPage } from "./import/import-page.tsx";
import type { Navigation } from "./navigation.ts";
import { OidcSection } from "./oidc/oidc-section.tsx";
import type { Session } from "./session/session.ts";
import { NoAccess } from "./vaults/no-access.tsx";
import { requestAccess, vaultIdOf } from "./vaults/vault-members.ts";
import type { VaultStore } from "./vaults/vault-store.ts";

type EmergencyApi = Parameters<typeof EmergencyPage>[0]["api"];
type DevicesApi = Parameters<typeof DevicesSection>[0]["api"] &
  Parameters<typeof OidcSection>[0]["api"];

/**
 * The identity provider and the device list in the settings (K-303, K-604), with the session's
 * token; signing this device out forgets the account here
 */
export const devicesFor = (props: { api: DevicesApi; session: Session; nav: Navigation }) => () => (
  <Show when={props.session.opened()?.token}>
    {(token) => (
      <>
        <OidcSection token={token()} api={props.api} />
        <DevicesSection
          token={token()}
          api={props.api}
          onSignedOut={() => {
            props.session.forget();
            props.nav.replace("/entries");
          }}
        />
      </>
    )}
  </Show>
);

/** The import (K-501) with where it may write, what is there already, and the write */
export const importPage =
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
export const emergencyPage =
  (props: { api: EmergencyApi; session: Session }, vaults: () => Vault[] | undefined) =>
  (toasts: Toasts) => (
    <EmergencyPage api={props.api} session={props.session} vaults={vaults} toasts={toasts} />
  );

/** What shows for a vault link this account cannot open: a way to ask for access (K-305) */
export const noAccessFor =
  (props: { api: VaultDeps; session: Session }, store: VaultStore) => (vaultId: string) => {
    const shown = store.shown();
    // A vault refused for any reason but a time run out is this account's: no "no access" then
    const known =
      shown.state !== "ready" ||
      shown.vaults.some((v) => v.idText === vaultId) ||
      shown.refused.some((r) => r.idText === vaultId && r.error !== "expired");
    const id = vaultIdOf(vaultId);
    if (known || !id) return undefined;
    return <NoAccess onRequest={() => requestAccess(props.api, props.session, id)} />;
  };

/** A deep link of another app (K-604): replaced at once by the page it names, IDs only */
export const OpenLink = (props: { nav: Navigation }) => {
  onSettled(() => props.nav.replace(openTarget(location.search)));
  return null;
};
