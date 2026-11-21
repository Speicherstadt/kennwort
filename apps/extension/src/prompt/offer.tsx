/**
 * The save prompt's offer once the account is open (K-404): it loads the entries itself, decides
 * what to offer (prompt-view.ts) and asks to be shown only then; nothing to offer closes the prompt
 * unseen. "Speichern" with the vault to save into, or "Aktualisieren", and "Nie für diese Seite";
 * the writes are prompt-actions.ts.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { Button, m, selectClass } from "@kennwort/ui";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onSettled,
  Show,
  Switch,
} from "solid-js";
import { createEntryLoad } from "../account/load-entries.ts";
import type { PopupAccount } from "../account/popup-account.ts";
import type { VisibilityGuard } from "../menu/visibility.ts";
import type { Capture } from "../save/messages.ts";
import { frameRequest, type PromptBridge, waitOf } from "./bridge.ts";
import { createPromptActions, type PromptActions } from "./prompt-actions.ts";
import { type PromptView, promptView, type VaultChoice } from "./prompt-view.ts";

/** How long "Gespeichert" stays before the prompt closes */
export const DONE_MS = 2_500;

/** The login as the prompt names it: the user name, or that there is none */
export const LoginLine = (props: { capture: Capture }) => (
  <p class="truncate text-xs text-muted-foreground">
    {props.capture.username.trim() === "" ? m.save_prompt_no_username() : props.capture.username}
  </p>
);

const NeverButton = (props: { actions: PromptActions }) => (
  <Button
    variant="ghost"
    size="sm"
    disabled={props.actions.busy()}
    onClick={(event) => void props.actions.never(event)}
  >
    {m.save_prompt_never()}
  </Button>
);

const NewLogin = (props: { capture: Capture; vaults: VaultChoice[]; actions: PromptActions }) => {
  const [chosen, setChosen] = createSignal<string>();
  // A plain mirror: a click right after the choice must see it before the signal flushes
  let picked: string | undefined;
  const choose = (idText: string) => {
    picked = idText;
    setChosen(idText);
  };
  const vault = () => chosen() ?? props.vaults[0]?.idText ?? "";
  return (
    <div class="grid gap-2">
      <p class="text-[13px] font-semibold">{m.save_prompt_new_title()}</p>
      <LoginLine capture={props.capture} />
      <Show when={props.vaults.length > 1}>
        <label class="grid gap-1 text-xs font-medium">
          {m.save_prompt_vault()}
          <select
            class={selectClass}
            value={vault()}
            onChange={(event) => choose(event.currentTarget.value)}
          >
            <For each={props.vaults}>
              {(choice) => (
                <option value={choice.idText}>{choice.name ?? m.vaults_unnamed()}</option>
              )}
            </For>
          </select>
        </label>
      </Show>
      <div class="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={props.actions.busy()}
          onClick={(event) =>
            void props.actions.saveNew(event, picked ?? props.vaults[0]?.idText ?? "")
          }
        >
          {m.save_prompt_save()}
        </Button>
        <NeverButton actions={props.actions} />
      </div>
    </div>
  );
};

const ChangedLogin = (props: { capture: Capture; entry: ShownEntry; actions: PromptActions }) => (
  <div class="grid gap-2">
    <p class="text-[13px] font-semibold">{m.save_prompt_changed_title()}</p>
    <p class="truncate text-xs">{props.entry.title}</p>
    <LoginLine capture={props.capture} />
    <div class="flex flex-wrap gap-2">
      <Button
        variant="primary"
        size="sm"
        disabled={props.actions.busy()}
        onClick={(event) => void props.actions.update(event, props.entry)}
      >
        {m.save_prompt_update()}
      </Button>
      <NeverButton actions={props.actions} />
    </div>
  </div>
);

/** Why the prompt offers nothing it could write */
const NOTES: Partial<Record<PromptView["kind"], () => string>> = {
  "read-only": m.save_prompt_read_only,
  "rotation-due": m.save_prompt_rotation_due,
  "no-vault": m.save_prompt_no_vault,
};

export const Offer = (props: {
  account: PopupAccount;
  capture: Capture;
  bridge: PromptBridge;
  guard: VisibilityGuard;
  onNote: (note: string | undefined) => void;
}) => {
  const { load, entries, vaults, store, start } = createEntryLoad(props.account, { policy: false });
  const [done, setDone] = createSignal<string>();
  // Decided once: the prompt's own save changes the entries, and must not turn its offer into
  // "nothing to offer" and close it before it said "Gespeichert"
  let decided: PromptView | undefined;
  const view = createMemo<PromptView>(() => {
    const now = promptView({
      phase: props.account.phase(),
      load: load(),
      entries: entries(),
      vaults: vaults(),
      neverSave: props.account.opened()?.state.neverSave ?? [],
      capture: props.capture,
    });
    if (now.kind !== "waiting") decided ??= now;
    return decided ?? now;
  });
  const pick = <K extends PromptView["kind"]>(kind: K) =>
    createMemo(() => {
      const current = view();
      return current.kind === kind ? (current as Extract<PromptView, { kind: K }>) : undefined;
    });
  const newOffer = pick("new");
  const changedOffer = pick("changed");
  const actions = createPromptActions({
    account: props.account,
    capture: props.capture,
    bridge: props.bridge,
    guard: props.guard,
    store,
    onNote: props.onNote,
    onDone: (text) => {
      setDone(text);
      void waitOf(props.bridge)(DONE_MS).then(() => frameRequest(props.bridge, "prompt-close"));
    },
    onNever: () => frameRequest(props.bridge, "prompt-close"),
  });
  onSettled(() => void start());
  // Shown only once there is something to say; nothing to offer closes it unseen
  createEffect(
    () => view().kind,
    (kind) => {
      if (kind === "close") frameRequest(props.bridge, "prompt-close");
      else if (kind !== "waiting") frameRequest(props.bridge, "prompt-show");
    },
  );

  return (
    <Switch>
      <Match when={done()}>
        {(text) => (
          <p role="status" class="text-[13px] font-medium">
            {text()}
          </p>
        )}
      </Match>
      <Match when={view().kind === "waiting"}>
        <p role="status" class="text-xs text-muted-foreground">
          {m.popup_loading()}
        </p>
      </Match>
      <Match when={view().kind === "failed"}>
        <p role="alert" class="text-xs text-danger">
          {load() === "untrusted" ? m.popup_untrusted() : m.popup_load_failed()}
        </p>
      </Match>
      <Match when={NOTES[view().kind]}>
        {(note) => <p class="text-xs text-muted-foreground">{note()()}</p>}
      </Match>
      <Match when={newOffer()}>
        {(offer) => <NewLogin capture={props.capture} vaults={offer().vaults} actions={actions} />}
      </Match>
      <Match when={changedOffer()}>
        {(offer) => (
          <ChangedLogin capture={props.capture} entry={offer().entry} actions={actions} />
        )}
      </Match>
    </Switch>
  );
};
