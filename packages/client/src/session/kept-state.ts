/**
 * The account state a device kept, merged into whatever the server serves (E-07, E-13): a server
 * that plays back an older state cannot throw the device back behind what it has checked. The web
 * app keeps it in its offline copy (apps/web/src/session/offline-unlock.ts), the extension in
 * chrome.storage.session (apps/extension/src/account/unlocked-store.ts), the CLI in its config
 * folder (apps/cli/src/state-file.ts); all three merge it the same way.
 */
import { type AccountState, mergeStates, openState, sealState } from "@kennwort/core";
import type { KeptState } from "./state-sync.ts";

/**
 * Both states merged, the higher of each. A conflict (another root, bundle or log hash) means the
 * server showed something else than this device checked: the device keeps its own, and the vault
 * checks then refuse what does not fit it (P-06).
 */
export const mergedState = (mine: AccountState, served: AccountState) => {
  const both = mergeStates(mine, served);
  return both.ok ? both.value : mine;
};

type Holder = { accountKey: Uint8Array; accountId: Uint8Array; state: AccountState };

/**
 * The served state with the kept one merged in, sealed again under the higher counter to be kept;
 * a kept state of another account or a damaged one does not open and is replaced
 */
export const withKeptState = (
  opened: Holder,
  kept: KeptState | undefined,
  servedCounter: number,
): { state: AccountState; kept: KeptState } => {
  const mine = kept && openState(opened.accountKey, opened.accountId, kept.counter, kept.sealed);
  const state = mine?.ok ? mergedState(mine.value, opened.state) : opened.state;
  const counter = Math.max(kept?.counter ?? 0, servedCounter);
  const sealed = sealState(opened.accountKey, opened.accountId, counter, state);
  return { state, kept: { counter, sealed } };
};
