/**
 * The handover in the open app (K-605, handover.ts): the start in the own company's vaults, the
 * finish in the customer's company once the switch put it on screen. The contents wait in the
 * session, in memory only, and are dropped when the handover is done, given up or the app locks.
 */
import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import type { Imported, ImportWrite } from "@kennwort/client/entries/entry-import.ts";
import type { SaveError } from "@kennwort/client/entries/entry-store.ts";
import { newVault, type Vault, type VaultDeps } from "@kennwort/client/vaults/vaults.ts";
import { m } from "@kennwort/ui";
import { createSignal, Show } from "solid-js";
import type { CompanySwitcher } from "../companies/company-switch.ts";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import { addToVault, changeVaultRole } from "../vaults/vault-members.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import { type HandoverDeps, handoverWrites, runHandover } from "./handover.ts";
import { HandoverFinish, HandoverStart } from "./handover-dialogs.tsx";

/** What the handover needs of the open account's stores */
export type HandoverStores = {
  store: VaultStore;
  stored: () => StoredEntry[];
  saveImport: (
    vaultIdText: string,
    writes: readonly ImportWrite[],
  ) => Promise<{ ok: true; value: Imported } | { ok: false; error: SaveError }>;
};

/** The frame's props are read when used, never in the body: they may be getters (app.tsx) */
export const createHandover = (
  props: { session: Session; api: VaultDeps; nav: Navigation; switcher: CompanySwitcher },
  stores: HandoverStores,
) => {
  const companies = () => props.session.companies;
  const [startOf, setStartOf] = createSignal<Vault>();
  /** The other companies of the account: where a vault can go */
  const targets = () =>
    props.switcher.options().filter((option) => option.id !== companies().activeId());
  const start = async (vault: Vault, target: string) => {
    companies().startHandover({
      target,
      vaultName: vault.name ?? m.vaults_unnamed(),
      writes: handoverWrites(stores.stored(), vault.idText),
    });
    if (!(await props.switcher.switchTo(target))) companies().endHandover();
  };
  const deps: HandoverDeps = {
    create: (name) => newVault(props.api, props.session, name),
    reload: () => stores.store.reload(),
    save: (vaultIdText) => (batch) => stores.saveImport(vaultIdText, batch),
    add: (vault, customer) => addToVault(props.api, props.session, vault, customer, "manage"),
    reduce: (vault, accountId) =>
      changeVaultRole(props.api, props.session, vault, accountId, "edit"),
  };
  /** The handover waiting for the company on screen, if one is */
  const pending = () => {
    const handover = companies().handover();
    return handover && handover.target === companies().activeId() ? handover : undefined;
  };
  const people = () => {
    const shown = stores.store.shown();
    return shown.state === "ready" ? shown.people : undefined;
  };
  return {
    /** Whether a vault can go anywhere: the account has another company */
    possible: () => targets().length > 0,
    open: (vault: Vault) => setStartOf(vault),
    startDialog: () => (
      <Show when={startOf()}>
        {(vault) => (
          <HandoverStart
            vault={vault()}
            count={stores.stored().filter((e) => e.vaultIdText === vault().idText).length}
            companies={targets()}
            busy={props.switcher.busy()}
            onStart={(target) => void start(vault(), target)}
            onClose={() => setStartOf(undefined)}
          />
        )}
      </Show>
    ),
    finishDialog: () => (
      <Show when={pending()}>
        {(handover) => (
          <HandoverFinish
            vaultName={handover().vaultName}
            count={handover().writes.length}
            people={people()}
            me={props.session.opened()?.accountId ?? new Uint8Array()}
            onCancel={() => companies().endHandover()}
            onHandOver={async (customer) => {
              const me = props.session.opened()?.accountId;
              if (!me) return "create";
              const done = await runHandover(deps, handover(), customer, me);
              if (!done.ok) return done.step;
              companies().endHandover();
              props.nav.go(`/vaults/${done.value.vaultIdText}`);
              return undefined;
            }}
          />
        )}
      </Show>
    ),
  };
};
