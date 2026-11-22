/**
 * The open account's entries, loaded with the web app's code (packages/client): every log checked
 * under the pinned root, every record against its log. The popup (K-402), the inline menu (K-403)
 * and the save prompt (K-404) all load this way; what is decrypted lives only in that page's memory
 * and is gone when it closes. The popup applies the company policy first, which sets the lock time;
 * menu and prompt do not, since they never move the lock time (popup-account.ts, movesLock). The
 * prompt also writes through the same store (`store`), into one of the loaded vaults (`vaults`).
 * Each of them hands the loaded entries on (`onEntries`), once loaded and after every change, so the
 * alert list of the phishing warning follows them (alert/alert-refresh.ts, K-405).
 */
import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import { shown } from "@kennwort/client/entries/entries.ts";
import { createEntryStore, httpServerFor } from "@kennwort/client/entries/entry-store.ts";
import { applyPolicy } from "@kennwort/client/policy/policy.ts";
import { loadVaults, type Vault } from "@kennwort/client/vaults/vaults.ts";
import { createEffect, createMemo, createSignal } from "solid-js";
import type { PopupAccount } from "./popup-account.ts";

export type Load = "loading" | "ready" | "failed" | "untrusted";

export type EntryLoadOptions = {
  /** The company policy first (only the popup: it sets the lock time) */
  policy: boolean;
  /** The decrypted entries once loaded and after every change */
  onEntries?: (entries: readonly StoredEntry[]) => void;
};

export const createEntryLoad = (account: PopupAccount, options: EntryLoadOptions) => {
  const [load, setLoad] = createSignal<Load>("loading");
  const [vaults, setVaults] = createSignal<Vault[]>([]);
  const api = account.api();
  const store = api ? createEntryStore(httpServerFor(api.syncFetch), account) : undefined;
  const entries = createMemo(() => store?.entries().map(shown) ?? []);
  const report = options.onEntries;
  if (report)
    createEffect(
      () => (load() === "ready" ? store?.entries() : undefined),
      (loaded) => {
        if (loaded) report(loaded);
      },
    );
  return {
    load,
    entries,
    vaults,
    store,
    /** Loads once: the policy first where asked (it sets the lock time), then the vaults */
    start: async () => {
      if (!api || !store) return setLoad("failed");
      if (options.policy) await applyPolicy(api, account);
      const loaded = await loadVaults(api, account);
      if (!loaded.ok) return setLoad(loaded.error === "untrusted" ? "untrusted" : "failed");
      await store.load(loaded.value.vaults, loaded.value.trust);
      setVaults(loaded.value.vaults);
      setLoad("ready");
    },
  };
};
