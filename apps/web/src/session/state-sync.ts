/**
 * Writing the account state back (docs/sicherheitsdesign.md, Schlüsselhierarchie): load the newest
 * state from the server, merge it with this device's, apply the change and write it under the next
 * counter. Another device that wrote first makes the server answer stale: then once more from the
 * top. A state that does not open or does not merge is an attack, never overwritten. The change sees
 * the merged state and may refuse it (undefined): then nothing is written.
 */
import { type AccountState, mergeStates, openState, type Stored, sealState } from "@kennwort/core";
import type { KeptState } from "../offline/local-copy.ts";
import type { StateWrite } from "./members-api.ts";

export type StateDeps = {
  keys: (token: string) => Promise<Stored | undefined>;
  writeState: (token: string, sealed: Uint8Array, counter: number) => Promise<StateWrite>;
};

export type StateHolder = {
  accountKey: Uint8Array;
  accountId: Uint8Array;
  token: string;
  state: AccountState;
};

export type SaveError = "unreachable" | "damaged" | "conflict" | "refused";

const ATTEMPTS = 3;

export const saveState = async (
  api: StateDeps,
  holder: StateHolder,
  change: (state: AccountState) => AccountState | undefined,
): Promise<
  { ok: true; value: AccountState; kept: KeptState } | { ok: false; error: SaveError }
> => {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const stored = await api.keys(holder.token);
    if (!stored) return { ok: false, error: "unreachable" };
    const served = openState(
      holder.accountKey,
      holder.accountId,
      stored.stateCounter,
      stored.state,
    );
    if (!served.ok) return { ok: false, error: "damaged" };
    const merged = mergeStates(holder.state, served.value);
    if (!merged.ok) return { ok: false, error: "damaged" };
    const next = change(merged.value);
    if (!next) return { ok: false, error: "refused" };
    const counter = stored.stateCounter + 1;
    const sealed = sealState(holder.accountKey, holder.accountId, counter, next);
    const written = await api.writeState(holder.token, sealed, counter);
    if (written.ok) return { ok: true, value: next, kept: { counter, sealed } };
    if (!written.stale) return { ok: false, error: "unreachable" };
  }
  return { ok: false, error: "conflict" };
};
