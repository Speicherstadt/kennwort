/**
 * The vaults the app shows, loaded once the account is open and again after a change. An account
 * that is certified but has no vault yet gets its personal vault on the first load (K-305).
 */
import { m } from "@kennwort/ui";
import { createSignal } from "solid-js";
import type { Session } from "../session/session.ts";
import { type CreateError, type Loaded, loadVaults, newVault, type VaultDeps } from "./vaults.ts";

export type VaultsShown =
  | { state: "loading" }
  | { state: "failed"; error: "unreachable" | "untrusted" }
  | ({ state: "ready" } & Loaded);

export const createVaultStore = (api: VaultDeps, session: Session) => {
  const [shown, setShown] = createSignal<VaultsShown>({ state: "loading" });
  let personalTried = false;
  const reload = async (): Promise<void> => {
    const loaded = await loadVaults(api, session);
    if (!loaded.ok) {
      setShown({ state: "failed", error: loaded.error });
      return;
    }
    const empty = loaded.value.vaults.length === 0 && loaded.value.refused.length === 0;
    if (empty && !personalTried) {
      personalTried = true;
      const made = await newVault(api, session, m.vaults_personal_name());
      if (made.ok) return reload();
    }
    setShown({ state: "ready", ...loaded.value });
  };
  const create = async (name: string): Promise<CreateError | undefined> => {
    const made = await newVault(api, session, name);
    if (!made.ok) return made.error;
    await reload();
    return undefined;
  };
  return { shown, reload, create };
};

export type VaultStore = ReturnType<typeof createVaultStore>;
