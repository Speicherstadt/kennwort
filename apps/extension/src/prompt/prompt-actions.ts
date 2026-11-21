/**
 * What the save prompt writes (K-404), each after a click that counts (bridge.ts): a new login
 * into the chosen vault, the new password into an entry (the old one into its history), or the
 * site onto the never list in the account state. Entries go through the web app's entry store,
 * which encrypts, signs and binds each version to entry and vault (P-09) and refuses a vault this
 * account may only read or one with a rotation due (P-11); the account state is sealed under AK.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import type { EntryStore, SaveError } from "@kennwort/client/entries/entry-store.ts";
import { m } from "@kennwort/ui";
import { createSignal } from "solid-js";
import type { PopupAccount } from "../account/popup-account.ts";
import type { VisibilityGuard } from "../menu/visibility.ts";
import { newLogin, withPassword } from "../save/contents.ts";
import type { Capture } from "../save/messages.ts";
import { confirmed, type PromptBridge } from "./bridge.ts";

const errorText = (error: SaveError) =>
  error === "read-only"
    ? m.save_prompt_read_only()
    : error === "rotation-due"
      ? m.save_prompt_rotation_due()
      : m.save_prompt_failed();

export type PromptActionDeps = {
  account: PopupAccount;
  capture: Capture;
  bridge: PromptBridge;
  guard: VisibilityGuard;
  store: EntryStore | undefined;
  /** A note over the prompt (why nothing was written), or none */
  onNote: (note: string | undefined) => void;
  /** Written: what to say before the prompt closes */
  onDone: (text: string) => void;
  /** The site is on the never list: the prompt closes */
  onNever: () => void;
};

export const createPromptActions = (deps: PromptActionDeps) => {
  const [busy, setBusy] = createSignal(false);
  let running = false;

  /** Runs a write after a click that counts; says why not otherwise */
  const act = async (event: Event, write: () => Promise<void>) => {
    if (running) return;
    running = true;
    setBusy(true);
    try {
      if (!(await confirmed(deps.bridge, deps.guard, event)))
        return deps.onNote(m.save_prompt_hidden());
      deps.onNote(undefined);
      await write();
    } finally {
      running = false;
      setBusy(false);
    }
  };

  return {
    busy,
    saveNew: (event: Event, vaultIdText: string) =>
      act(event, async () => {
        const saved = await deps.store?.save(vaultIdText, newLogin(deps.capture));
        if (saved?.ok) return deps.onDone(m.save_prompt_saved());
        deps.onNote(errorText(saved?.ok === false ? saved.error : "not-saved"));
      }),
    update: (event: Event, entry: ShownEntry) =>
      act(event, async () => {
        const stored = deps.store?.entries().find((e) => e.idText === entry.id);
        if (!deps.store || !stored) return deps.onNote(m.save_prompt_failed());
        const content = withPassword(stored.content, deps.capture.password, Date.now());
        const saved = await deps.store.save(stored.vaultIdText, content, stored.idText);
        if (saved.ok) return deps.onDone(m.save_prompt_updated());
        deps.onNote(errorText(saved.error));
      }),
    never: (event: Event) =>
      act(event, async () => {
        const api = deps.account.api();
        const host = deps.capture.host;
        const saved =
          api &&
          (await deps.account.updateState(api, (state) => ({
            ...state,
            neverSave: [...new Set([...state.neverSave, host])].sort(),
          })));
        if (saved?.ok) return deps.onNever();
        deps.onNote(m.save_prompt_failed());
      }),
  };
};

export type PromptActions = ReturnType<typeof createPromptActions>;
