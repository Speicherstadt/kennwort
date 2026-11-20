/**
 * The vaults the app shows, loaded once the account is open and again after a change. An account
 * that is certified but has no vault yet gets its personal vault on the first load (K-305).
 */

import {
  type CreateError,
  type Loaded,
  loadVaults,
  newVault,
  type VaultDeps,
} from "@kennwort/client/vaults/vaults.ts";
import { m } from "@kennwort/ui";
import { createSignal } from "solid-js";
import type { Session } from "../session/session.ts";
import type { ChangeError } from "./vault-members.ts";

export type VaultsShown =
  | { state: "loading" }
  | { state: "failed"; error: "unreachable" | "untrusted" }
  | ({ state: "ready" } & Loaded);

export const createVaultStore = (
  api: VaultDeps,
  session: Session,
  /** Called with every load that succeeded: the entries load from the vaults it opened */
  onLoaded: (loaded: Loaded) => void = () => {},
) => {
  const [shown, setShown] = createSignal<VaultsShown>({ state: "loading" });
  let personalTried = false;
  /** Only the newest load shows: an older answer that arrives later is dropped */
  let generation = 0;
  const reload = async (): Promise<void> => {
    const mine = ++generation;
    const loaded = await loadVaults(api, session);
    if (mine !== generation) return;
    if (!loaded.ok) {
      setShown({ state: "failed", error: loaded.error });
      return;
    }
    if (needsPersonal(loaded.value) && !personalTried) {
      const made = await newVault(api, session, m.vaults_personal_name(), true);
      // An account whose keys are not confirmed yet tries again on a later load
      personalTried = made.ok || made.error !== "uncertified";
      if (made.ok || made.error === "exists") return reload();
    }
    setShown({ state: "ready", ...loaded.value });
    onLoaded(loaded.value);
  };
  /**
   * The personal vault only for an account that never saw a vault: if the server lists none of the
   * vaults this account remembers, it hides them, and a new vault would cover that up
   */
  const needsPersonal = (loaded: Loaded) =>
    loaded.vaults.length === 0 &&
    loaded.refused.length === 0 &&
    Object.keys(session.opened()?.state.logs ?? { seen: true }).length === 0;
  const create = async (name: string): Promise<CreateError | undefined> => {
    const made = await newVault(api, session, name);
    if (!made.ok) return made.error;
    await reload();
    return undefined;
  };
  /** A change to a vault's members, then the vault anew: also after "stale", to try again on it */
  const change = async (
    run: () => Promise<{ ok: true } | { ok: false; error: ChangeError }>,
  ): Promise<ChangeError | undefined> => {
    const done = await run();
    await reload();
    return done.ok ? undefined : done.error;
  };
  return { shown, reload, create, change };
};

export type VaultStore = ReturnType<typeof createVaultStore>;
