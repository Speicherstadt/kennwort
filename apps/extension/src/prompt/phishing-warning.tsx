/**
 * The phishing warning (K-405, DESIGN.md Phishing-Warnung): the prompt page shows it instead of the
 * save prompt when the service worker hands it a warning. It opens the account the popup unlocked
 * without moving the lock time, loads the entries itself and checks what the worker found by tags
 * (alert-view.ts); only then does it show itself, at the top right, without blocking the page, and
 * pin itself on top (content/prompt-frame.ts). Locked, it closes unseen: there is nothing to check.
 *
 * "Passwort ändern" opens the site's change-password page, "Eintrag öffnen" the entry in the web
 * app. "Das ist nicht … – trotzdem fortfahren" and × close it only after a click that counts, with
 * the same checks as a save (bridge.ts): a page cannot click the warning away under a cover. As in
 * Password Alert, the warning is a help, not a lock: the page stays usable throughout.
 */
import { Button, buttonClass, Icon, m } from "@kennwort/ui";
import { ShieldExclamationPoint } from "@kennwort/ui/icons";
import { createEffect, createMemo, createSignal, onSettled, Show } from "solid-js";
import { createEntryLoad } from "../account/load-entries.ts";
import type { PopupAccount } from "../account/popup-account.ts";
import { refreshAlertList } from "../alert/alert-refresh.ts";
import type { Warning } from "../alert/messages.ts";
import { createVisibilityGuard } from "../menu/visibility.ts";
import { type AlertView, alertView, changePasswordUrl } from "./alert-view.ts";
import { confirmed, frameRequest, type PromptBridge } from "./bridge.ts";
import { watchPromptFrame } from "./frame-watch.ts";
import { PromptHeader } from "./prompt-header.tsx";

type Shown = Extract<AlertView, { kind: "warn" }>;

const LINK = "text-xs font-medium underline-offset-4 hover:underline";

const Details = (props: {
  shown: Shown;
  host: string;
  server: string | undefined;
  onDismiss: (event: Event) => void;
}) => (
  <div class="grid gap-2">
    <p class="flex items-center gap-1.5 text-[13px] font-semibold text-danger">
      <Icon icon={ShieldExclamationPoint} size={16} />
      {m.alert_title({ site: props.shown.site })}
    </p>
    <p class="text-xs">
      {m.alert_text({ title: props.shown.entry.title, site: props.shown.site, host: props.host })}
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <a
        class={buttonClass({ variant: "danger", size: "sm" })}
        href={changePasswordUrl(props.shown.site, props.shown.secure)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {m.alert_change()}
      </a>
      <Show when={props.server}>
        {(server) => (
          <a
            class={LINK}
            href={`${server()}/entries/${encodeURIComponent(props.shown.entry.id)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {m.alert_open_entry()}
          </a>
        )}
      </Show>
    </div>
    <Button
      variant="ghost"
      size="sm"
      class="h-auto justify-start py-1 text-left whitespace-normal"
      onClick={(event) => props.onDismiss(event)}
    >
      {m.alert_continue({ site: props.shown.site })}
    </Button>
  </div>
);

const AlertBody = (props: {
  account: PopupAccount;
  warning: Warning;
  bridge: PromptBridge;
  onDismiss: (event: Event) => void;
}) => {
  const { load, entries, start } = createEntryLoad(props.account, {
    policy: false,
    onEntries: refreshAlertList,
  });
  // Decided once: a refresh of the entries must not take a shown warning away again
  let decided: AlertView | undefined;
  const view = createMemo<AlertView>(() => {
    const now = alertView({ load: load(), entries: entries(), warning: props.warning });
    if (now.kind !== "waiting") decided ??= now;
    return decided ?? now;
  });
  const shown = createMemo(() => {
    const current = view();
    return current.kind === "warn" ? current : undefined;
  });
  onSettled(() => void start());
  createEffect(
    () => view().kind,
    (kind) => {
      if (kind === "close") return frameRequest(props.bridge, "prompt-close");
      if (kind !== "warn") return;
      frameRequest(props.bridge, "prompt-show");
      frameRequest(props.bridge, "prompt-pin");
    },
  );
  return (
    <Show
      when={shown()}
      fallback={
        <p role="status" class="text-xs text-muted-foreground">
          {m.popup_loading()}
        </p>
      }
    >
      {(current) => (
        <Details
          shown={current()}
          host={props.warning.host}
          server={props.account.device()?.server}
          onDismiss={props.onDismiss}
        />
      )}
    </Show>
  );
};

export const PhishingWarning = (props: {
  account: PopupAccount;
  warning: Warning;
  bridge: PromptBridge;
}) => {
  const [armed, setArmed] = createSignal(false);
  const [note, setNote] = createSignal<string>();
  const guard = createVisibilityGuard();
  let root: HTMLElement | undefined;
  let busy = false;

  /** Closes only after a click that counts; a covered click says why it did not */
  const dismiss = async (event: Event) => {
    if (busy) return;
    busy = true;
    try {
      if (await confirmed(props.bridge, guard, event)) frameRequest(props.bridge, "prompt-close");
      else setNote(m.alert_hidden());
    } finally {
      busy = false;
    }
  };

  createEffect(
    () => props.account.phase(),
    (phase) => {
      if (phase === "locked" || phase === "connect") frameRequest(props.bridge, "prompt-close");
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
      aria-label={m.alert_frame()}
      data-armed={armed() ? "true" : "false"}
      class="flex flex-col overflow-hidden rounded-xl border border-danger bg-background text-foreground"
    >
      <PromptHeader host={props.warning.host} onClose={(event) => void dismiss(event)} />
      <div class="grid gap-2 px-3 py-2">
        <Show when={note()}>
          {(text) => (
            <p role="alert" class="text-xs text-danger">
              {text()}
            </p>
          )}
        </Show>
        <Show when={props.account.phase() === "open"}>
          <AlertBody
            account={props.account}
            warning={props.warning}
            bridge={props.bridge}
            onDismiss={(event) => void dismiss(event)}
          />
        </Show>
      </div>
    </main>
  );
};
