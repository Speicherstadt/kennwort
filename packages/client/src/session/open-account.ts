/**
 * The open account as the web app and the extension both hold it: the unlocked keys and state, the
 * account ID and the session token. Shared logic (vaults, entries, policy) asks only for this.
 */
import type { AccountState, Unlocked } from "@kennwort/core";
import { encodeBytes, followRoot, mergeStates } from "@kennwort/core";
import { type KeptState, type SaveError, type StateDeps, saveState } from "./state-sync.ts";

/**
 * An open account. Opened from the web app's offline copy (K-308 part b) it has no token yet but
 * the sign-in key, in memory like AK, to sign in once the server answers again; locking overwrites
 * both.
 */
export type Opened = Unlocked & { accountId: Uint8Array; token: string; loginKey?: Uint8Array };

/** Where the account state is kept as written: the web app's offline copy; the extension has none */
export type StateKeeper = {
  keepState: (accountIdText: string, kept: KeptState) => Promise<unknown>;
};

/** Changes the account state, merged with the server's, and writes it back (state-sync.ts) */
export type UpdateState = (
  api: StateDeps,
  change: (state: AccountState) => AccountState | undefined,
) => Promise<{ ok: true; value: AccountState } | { ok: false; error: SaveError | "unreachable" }>;

/** What shared logic needs of an open account */
export type OpenAccount = { opened: () => Opened | undefined; updateState: UpdateState };

/**
 * The account state changed and written back; the open account sees the new one (state-sync.ts),
 * and the keeper, if there is one, keeps it as written
 */
export const stateUpdater =
  (
    opened: () => Opened | undefined,
    setOpened: (value: Opened) => void,
    keeper?: StateKeeper,
  ): UpdateState =>
  async (api, change) => {
    const current = opened();
    if (!current) return { ok: false as const, error: "unreachable" as const };
    const saved = await saveState(api, current, change);
    if (!saved.ok) return saved;
    // Another change of the same account may have replaced the open account meanwhile: the state
    // written here is merged into the newer one, so neither change is lost in memory (K-707)
    const latest = opened();
    if (latest && encodeBytes(latest.accountId) === encodeBytes(current.accountId)) {
      const merged =
        latest === current
          ? { ok: true as const, value: saved.value }
          : mergeStates(latest.state, saved.value);
      // A confirmed root change moves the key block's root along (P-07)
      if (merged.ok)
        setOpened({
          ...latest,
          state: merged.value,
          keyBlock: followRoot(latest.keyBlock, merged.value),
        });
    }
    await keeper?.keepState(encodeBytes(current.accountId), saved.kept);
    return { ok: true as const, value: saved.value };
  };
