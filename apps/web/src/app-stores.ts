/**
 * The stores of an open account (app.tsx): the vaults, their entries, the shares, the exits, the
 * export and the one-time links, all for the account on screen.
 */
import { httpServerFor } from "@kennwort/client/entries/entry-store.ts";
import type { AccountApi, Api } from "@kennwort/client/session/api.ts";
import type { DevicesApi } from "@kennwort/client/session/devices-api.ts";
import type { EmergencyApi } from "@kennwort/client/session/emergency-api.ts";
import type { GroupApi } from "@kennwort/client/session/groups-api.ts";
import type { LinkApi } from "@kennwort/client/session/links-api.ts";
import type { NotificationApi } from "@kennwort/client/session/notifications-api.ts";
import type { OidcApi } from "@kennwort/client/session/oidc-api.ts";
import type { PwnedApi } from "@kennwort/client/session/pwned-api.ts";
import type { ShareApi } from "@kennwort/client/session/shares-api.ts";
import type { VaultApi } from "@kennwort/client/session/vaults-api.ts";
import type { PairDeps } from "./account/pair-page.tsx";
import { renewEmergency } from "./emergency/emergency.ts";
import { createEntries } from "./entries/entries-wiring.tsx";
import { exportDeps } from "./export/export-wiring.ts";
import { createLinks } from "./links/links-wiring.tsx";
import type { MembersDeps } from "./members/members.ts";
import type { LocalCopy } from "./offline/local-copy.ts";
import type { Session } from "./session/session.ts";
import { createSharing } from "./shares/shares-wiring.tsx";
import { createExits } from "./vaults/exit.ts";
import { createVaultStore, type VaultStore } from "./vaults/vault-store.ts";

export type AppApi = PairDeps &
  DevicesApi &
  MembersDeps &
  VaultApi &
  GroupApi &
  ShareApi &
  EmergencyApi &
  LinkApi &
  NotificationApi &
  PwnedApi &
  OidcApi &
  Pick<AccountApi, "replaceUnlock"> &
  Pick<Api, "rekey"> & { syncFetch: typeof fetch };

/**
 * The stores of an open account: the vaults, their entries, the shares, the exits and the export.
 * Every load of the vaults loads their entries and shares; then a manager's client catches up on
 * what its vaults owe since someone left (K-307, P-11), without holding up the load.
 */
export const createStores = (props: {
  session: Session;
  api: AppApi;
  copy: LocalCopy | undefined;
}) => {
  const entries = createEntries(httpServerFor(props.api.syncFetch), props.session, props.copy);
  const sharing = createSharing(props.api, props.session, entries.keys);
  const exits = createExits(
    { api: props.api, session: props.session },
    {
      reload: () => store.reload(),
      rotate: entries.rotate,
      behind: entries.behind,
      resave: entries.resave,
      restore: entries.restore,
      restorable: entries.restorable,
    },
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
  const links = createLinks(props.api, props.session);
  return { entries, sharing, exits, store, exporting, links };
};
