/**
 * The passkey prompt (K-406, DESIGN.md Passkey-Leiste): the prompt page shows it instead of the
 * save prompt when the service worker hands it a ceremony a page started. It opens the account the
 * popup unlocked without moving the lock time and loads the entries itself (passkey-view.ts).
 * Locked, without entries, or without a passkey for the sign-in, it hands the ceremony to the
 * browser's own WebAuthn unseen. Otherwise it shows itself at the top right: "Passkey speichern"
 * with the vault to save into, or "Anmelden als …" for each passkey that fits, and always "Anderes
 * Gerät verwenden". Saving and signing take a click the browser delivered while the prompt was
 * visible, uncovered and opaque (passkey-actions.ts); × ends the ceremony with NotAllowedError.
 */
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
import { refreshAlertList } from "../alert/alert-refresh.ts";
import { createVisibilityGuard, type VisibilityGuard } from "../menu/visibility.ts";
import type { Ceremony, PasskeyAnswer } from "../passkey/messages.ts";
import { frameRequest, type PromptBridge } from "./bridge.ts";
import { watchPromptFrame } from "./frame-watch.ts";
import { createPasskeyActions, type PasskeyActions } from "./passkey-actions.ts";
import { type PasskeyChoice, type PasskeyView, passkeyView } from "./passkey-view.ts";
import { PromptHeader } from "./prompt-header.tsx";
import type { VaultChoice } from "./prompt-view.ts";

const OtherDevice = (props: { actions: PasskeyActions }) => (
  <Button variant="ghost" size="sm" onClick={() => props.actions.otherDevice()}>
    {m.passkey_prompt_other_device()}
  </Button>
);

const Heading = (props: { title: string; rpId: string }) => (
  <div class="grid gap-0.5">
    <p class="text-[13px] font-semibold">{props.title}</p>
    <p class="truncate text-xs text-muted-foreground">
      {m.passkey_prompt_for({ rpId: props.rpId })}
    </p>
  </div>
);

const NewPasskey = (props: {
  ceremony: Extract<Ceremony, { kind: "create" }>;
  vaults: VaultChoice[];
  actions: PasskeyActions;
}) => {
  const [chosen, setChosen] = createSignal<string>();
  // A plain mirror: a click right after the choice must see it before the signal flushes
  let picked: string | undefined;
  const vault = () => chosen() ?? props.vaults[0]?.idText ?? "";
  return (
    <div class="grid gap-2">
      <Heading title={m.passkey_prompt_create_title()} rpId={props.ceremony.rpId} />
      <p class="truncate text-xs">
        {props.ceremony.user.name.trim() === ""
          ? m.passkey_prompt_no_username()
          : props.ceremony.user.name}
      </p>
      <Show when={props.vaults.length > 1}>
        <label class="grid gap-1 text-xs font-medium">
          {m.save_prompt_vault()}
          <select
            class={selectClass}
            value={vault()}
            onChange={(event) => {
              picked = event.currentTarget.value;
              setChosen(picked);
            }}
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
            void props.actions.save(event, picked ?? props.vaults[0]?.idText ?? "")
          }
        >
          {m.passkey_prompt_save()}
        </Button>
        <OtherDevice actions={props.actions} />
      </div>
    </div>
  );
};

const SignIn = (props: { rpId: string; choices: PasskeyChoice[]; actions: PasskeyActions }) => (
  <div class="grid gap-2">
    <Heading title={m.passkey_prompt_get_title()} rpId={props.rpId} />
    <div class="grid gap-1.5">
      <For each={props.choices}>
        {(choice) => (
          <Button
            variant="primary"
            size="sm"
            class="justify-start truncate"
            disabled={props.actions.busy()}
            onClick={(event) => void props.actions.sign(event, choice.entryId)}
          >
            {m.passkey_prompt_sign_in({ name: choice.name })}
          </Button>
        )}
      </For>
    </div>
    <OtherDevice actions={props.actions} />
  </div>
);

/** Why the prompt offers nothing it could save */
const NOTES: Partial<Record<PasskeyView["kind"], () => string>> = {
  excluded: m.passkey_prompt_excluded,
  "no-vault": m.passkey_prompt_no_vault,
};

const PasskeyOffer = (props: {
  account: PopupAccount;
  ceremony: Ceremony;
  bridge: PromptBridge;
  guard: VisibilityGuard;
  onNote: (note: string | undefined) => void;
  onAnswer: (answer: PasskeyAnswer) => void;
}) => {
  const { load, vaults, store, start } = createEntryLoad(props.account, {
    policy: false,
    onEntries: refreshAlertList,
  });
  // Decided once: the prompt's own save changes the entries
  let decided: PasskeyView | undefined;
  const view = createMemo<PasskeyView>(() => {
    const now = passkeyView({
      phase: props.account.phase(),
      load: load(),
      entries: store?.entries() ?? [],
      vaults: vaults(),
      ceremony: props.ceremony,
    });
    if (now.kind !== "waiting") decided ??= now;
    return decided ?? now;
  });
  const pick = <K extends PasskeyView["kind"]>(kind: K) =>
    createMemo(() => {
      const current = view();
      return current.kind === kind ? (current as Extract<PasskeyView, { kind: K }>) : undefined;
    });
  const creating = pick("create");
  const signing = pick("get");
  const actions = createPasskeyActions({
    ceremony: props.ceremony,
    bridge: props.bridge,
    guard: props.guard,
    store,
    onNote: props.onNote,
    onAnswer: props.onAnswer,
  });
  onSettled(() => void start());
  // Shown only once there is something to offer; nothing to offer is the browser's own WebAuthn
  createEffect(
    () => view().kind,
    (kind) => {
      if (kind === "fallback") actions.otherDevice();
      else if (kind !== "waiting") frameRequest(props.bridge, "prompt-show");
    },
  );
  const createCeremony = () => (props.ceremony.kind === "create" ? props.ceremony : undefined);

  return (
    <Switch>
      <Match when={NOTES[view().kind]}>
        {(note) => (
          <div class="grid gap-2">
            <p class="text-xs text-muted-foreground">{note()()}</p>
            <OtherDevice actions={actions} />
          </div>
        )}
      </Match>
      <Match when={creating() && createCeremony()}>
        {(ceremony) => (
          <NewPasskey ceremony={ceremony()} vaults={creating()?.vaults ?? []} actions={actions} />
        )}
      </Match>
      <Match when={signing()}>
        {(offer) => (
          <SignIn rpId={props.ceremony.rpId} choices={offer().choices} actions={actions} />
        )}
      </Match>
      <Match when={true}>
        <p role="status" class="text-xs text-muted-foreground">
          {m.popup_loading()}
        </p>
      </Match>
    </Switch>
  );
};

export const PasskeyPrompt = (props: {
  account: PopupAccount;
  ceremony: Ceremony;
  bridge: PromptBridge;
  /** Ends the ceremony once, across re-renders after a lock or an unlock (main.tsx) */
  onAnswer: (answer: PasskeyAnswer) => void;
}) => {
  const [armed, setArmed] = createSignal(false);
  const [note, setNote] = createSignal<string>();
  const guard = createVisibilityGuard();
  let root: HTMLElement | undefined;

  // Locked: the browser's own WebAuthn, without showing anything
  createEffect(
    () => props.account.phase(),
    (phase) => {
      if (phase === "locked" || phase === "connect") props.onAnswer({ outcome: "fallback" });
    },
  );

  onSettled(() => {
    void props.account.restore();
    return watchPromptFrame(root, props.bridge, guard, setArmed);
  });

  return (
    <main
      ref={(el) => {
        root = el;
      }}
      aria-label={m.passkey_prompt_frame()}
      data-armed={armed() ? "true" : "false"}
      class="flex flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground"
    >
      <PromptHeader
        host={new URL(props.ceremony.origin).host}
        onClose={() => props.onAnswer({ outcome: "error", name: "NotAllowedError" })}
      />
      <div class="grid gap-2 px-3 py-2">
        <Show when={!props.bridge.verifiable}>
          <p class="text-xs text-warning">{m.passkey_prompt_unverified()}</p>
        </Show>
        <Show when={note()}>
          {(text) => (
            <p role="alert" class="text-xs text-danger">
              {text()}
            </p>
          )}
        </Show>
        <Show
          when={props.account.phase() === "open"}
          fallback={
            <p role="status" class="text-xs text-muted-foreground">
              {m.popup_loading()}
            </p>
          }
        >
          <PasskeyOffer
            account={props.account}
            ceremony={props.ceremony}
            bridge={props.bridge}
            guard={guard}
            onNote={setNote}
            onAnswer={props.onAnswer}
          />
        </Show>
      </div>
    </main>
  );
};
