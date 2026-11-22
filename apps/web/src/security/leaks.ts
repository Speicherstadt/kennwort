/**
 * The leak check while the account is open (K-603, P-23): the state the security page shows, and
 * a run over the entries it is given. The ranges stay in the check's memory (packages/core,
 * createLeakCheck) and go with the account when it locks; while the check is off nothing is asked.
 * A run that a newer one overtook leaves the state to the newer one.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import type { LeakCheck, LeakError } from "@kennwort/core";
import { createSignal } from "solid-js";
import { type LeakedEntries, leakedByEntry, passwordsToCheck } from "./overview.ts";

export type LeakState =
  | { kind: "off" }
  | { kind: "checking" }
  | { kind: "done"; leaked: LeakedEntries }
  | { kind: "failed"; error: Exclude<LeakError, "off"> };

export const createLeaks = (check: LeakCheck) => {
  const [state, setState] = createSignal<LeakState>({ kind: "off" });
  let latest = 0;
  const refresh = async (entries: readonly ShownEntry[], enabled: boolean) => {
    const run = ++latest;
    // Written only after this point: refresh may be called from an effect's apply
    await Promise.resolve();
    if (run !== latest) return;
    if (!enabled) return setState({ kind: "off" });
    setState({ kind: "checking" });
    const result = await check.check(passwordsToCheck(entries), enabled);
    if (run !== latest) return;
    if (result.ok) setState({ kind: "done", leaked: leakedByEntry(entries, result.value) });
    else
      setState(result.error === "off" ? { kind: "off" } : { kind: "failed", error: result.error });
  };
  return { state, refresh };
};

export type Leaks = ReturnType<typeof createLeaks>;
