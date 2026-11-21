/**
 * The save prompt (K-404, DESIGN.md Speichern-Leiste): an extension page the content script frames
 * at the top right of the page after a sign-in. It opens the account the popup unlocked without
 * moving the lock time, loads the entries itself and compares (prompt-view.ts): nothing to offer
 * closes it before it was ever shown. Otherwise "Speichern" with the vault to save into,
 * "Aktualisieren" (the old password goes into the entry's history), "Nie für diese Seite", or,
 * while locked, "Entsperren und speichern", which opens the popup.
 *
 * Saving and "Nie für diese Seite" take a click the browser delivered (`isTrusted`) while the prompt
 * was visible, uncovered and opaque, as filling from the menu does (menu/visibility.ts), and the
 * content script's own check of the frame (content/prompt-frame.ts) right before the write. The
 * write goes through the web app's entry store: encrypted, signed and bound to entry, vault and
 * version (P-09).
 */
import { Button, Icon, IconButton, m } from "@kennwort/ui";
import { Lock, X } from "@kennwort/ui/icons";
import { createEffect, createSignal, Match, onSettled, Show, Switch } from "solid-js";
import type { PopupAccount } from "../account/popup-account.ts";
import { ARM_AFTER_MS, createVisibilityGuard, watchVisibility } from "../menu/visibility.ts";
import type { Capture } from "../save/messages.ts";
import { frameRequest, type PromptBridge } from "./bridge.ts";
import { LoginLine, Offer } from "./offer.tsx";

export type { PromptBridge } from "./bridge.ts";

export const SavePrompt = (props: {
  account: PopupAccount;
  capture: Capture;
  bridge: PromptBridge;
}) => {
  const [armed, setArmed] = createSignal(false);
  const [note, setNote] = createSignal<string>();
  const guard = createVisibilityGuard();
  let root: HTMLElement | undefined;
  const locked = () => props.account.phase() === "locked" || props.account.phase() === "connect";

  createEffect(
    () => locked(),
    (isLocked) => {
      if (isLocked) frameRequest(props.bridge, "prompt-show");
    },
  );

  onSettled(() => {
    void props.account.restore();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let visible = false;
    const stop = root
      ? watchVisibility(
          root,
          guard,
          (now) => {
            if (now === visible) return;
            visible = now;
            clearTimeout(timer);
            setArmed(false);
            if (now)
              timer = setTimeout(() => setArmed(guard.armed(props.bridge.now())), ARM_AFTER_MS);
          },
          props.bridge.Observer,
        )
      : () => {};
    const size = () => {
      const height = Math.ceil(root?.getBoundingClientRect().height ?? 0);
      if (height > 0)
        void props.bridge.request({ type: "prompt-size", nonce: props.bridge.nonce, height });
    };
    const resizes = globalThis.ResizeObserver ? new ResizeObserver(size) : undefined;
    if (root) resizes?.observe(root);
    return () => {
      stop();
      clearTimeout(timer);
      resizes?.disconnect();
    };
  });

  return (
    <main
      ref={(el) => {
        root = el;
      }}
      aria-label={m.save_prompt_frame()}
      data-armed={armed() ? "true" : "false"}
      class="flex flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground"
    >
      <header class="flex items-center gap-2 border-b border-border py-1 pr-1 pl-3">
        <span class="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
          <Icon icon={Lock} size={12} />
        </span>
        <span class="text-[13px] font-semibold">{m.app_name()}</span>
        <span class="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground">
          {props.capture.host}
        </span>
        <IconButton
          label={m.save_prompt_dismiss()}
          onClick={() => frameRequest(props.bridge, "prompt-close")}
        >
          <Icon icon={X} size={14} />
        </IconButton>
      </header>
      <div class="grid gap-2 px-3 py-2">
        <Show when={!props.bridge.verifiable}>
          <p class="text-xs text-warning">{m.save_prompt_unverified()}</p>
        </Show>
        <Show when={note()}>
          {(text) => (
            <p role="alert" class="text-xs text-danger">
              {text()}
            </p>
          )}
        </Show>
        <Switch>
          <Match when={locked()}>
            <div class="grid gap-2">
              <p class="text-[13px] font-semibold">{m.unlock_title()}</p>
              <LoginLine capture={props.capture} />
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  void props.bridge.request({ type: "prompt-unlock", nonce: props.bridge.nonce })
                }
              >
                {m.save_prompt_unlock()}
              </Button>
            </div>
          </Match>
          <Match when={props.account.phase() === "open"}>
            <Offer
              account={props.account}
              capture={props.capture}
              bridge={props.bridge}
              guard={guard}
              onNote={setNote}
            />
          </Match>
          <Match when={true}>
            <p role="status" class="text-xs text-muted-foreground">
              {m.popup_loading()}
            </p>
          </Match>
        </Switch>
      </div>
    </main>
  );
};
