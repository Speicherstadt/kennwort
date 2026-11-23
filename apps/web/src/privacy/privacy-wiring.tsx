/**
 * Einstellungen → „Datenschutz“ (K-607) with the session, the API and the vaults as loaded: the
 * download of the server's data as a file, and the deletion of the account, after which this
 * device forgets it and shows the welcome.
 */
import type { AppApi } from "../app-stores.ts";
import { download } from "../export/export.ts";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import { type DeleteOutcome, deleteAccount } from "./deletion.ts";
import { PrivacyPage } from "./privacy-page.tsx";

export type PrivacyWiring = {
  nav: Navigation;
  session: Session;
  api: AppApi;
};

const today = () => new Date().toISOString().slice(0, 10);

/** The server's data about the account as a JSON file; false when the server gave none */
const downloadData = async (props: PrivacyWiring) => {
  const token = props.session.opened()?.token;
  const data = token ? await props.api.privacyExport(token) : undefined;
  if (!data) return false;
  const bytes = new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`);
  download({ bytes, name: `kennwort-daten-${today()}.json`, type: "application/json" });
  return true;
};

/** The home account as the deletion needs it, with the vaults as loaded */
const removeWith =
  (props: PrivacyWiring, store: VaultStore) =>
  async (passphrase: string): Promise<DeleteOutcome> => {
    const opened = props.session.opened();
    const secretKey = props.session.device()?.secretKey;
    if (!opened || !secretKey || !props.session.companies.atHome())
      return { ok: false, error: "unexpected" };
    const shown = store.shown();
    const done = await deleteAccount(
      { api: props.api },
      {
        accountId: opened.accountId,
        token: opened.token,
        secretKey,
        edSecretKey: opened.keyBlock.ed.secretKey,
        linked: opened.state.linked,
        loaded: shown.state === "ready" ? shown : undefined,
      },
      passphrase,
    );
    if (done.ok) {
      props.session.forget();
      props.nav.replace("/");
    }
    return done;
  };

export const privacyPage =
  (props: PrivacyWiring, store: VaultStore, canExport: () => boolean) => () => (
    <PrivacyPage
      download={() => downloadData(props)}
      onExport={canExport() ? () => props.nav.go("/export") : undefined}
      atHome={props.session.companies.atHome()}
      linked={props.session.companies
        .companies()
        .filter((company) => !company.home)
        .map((company) => company.name ?? "")}
      remove={removeWith(props, store)}
    />
  );
