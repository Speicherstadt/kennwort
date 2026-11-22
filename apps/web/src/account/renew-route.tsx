/** Konto → Schlüssel erneuern (K-307 part e) as the open account's frame shows it */
import type { Loaded } from "@kennwort/client/vaults/vaults.ts";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import type { RenewDeps } from "./renew.ts";
import { RenewPage } from "./renew-page.tsx";

/** The vaults as last loaded, for the renewal of keys to wrap anew (P-12); none before a load */
const loadedOf = (store: VaultStore): Loaded | undefined => {
  const shown = store.shown();
  if (shown.state !== "ready") return undefined;
  const { state: _, ...loaded } = shown;
  return loaded;
};

/** The page with the vaults as last loaded, loading them after */
export const renewPage =
  (
    props: { nav: Navigation; api: RenewDeps; session: Session },
    store: VaultStore,
    reload: () => Promise<void>,
  ) =>
  () => (
    <RenewPage
      nav={props.nav}
      session={props.session}
      api={props.api}
      loaded={() => loadedOf(store)}
      onRenewed={reload}
    />
  );
