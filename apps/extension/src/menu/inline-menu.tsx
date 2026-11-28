/**
 * The inline menu (K-403, DESIGN.md Inline-Menü): an extension page framed under a login field by
 * the content script. Head with logo and host, the entries for the frame's exact host as buttons
 * (↑↓, Enter, Esc), a footer with the keys. It opens the account the popup unlocked, never moves
 * the lock time (popup-account.ts, movesLock), and loads the entries itself; they stay in this
 * frame, which the page cannot read.
 *
 * A fill starts only with a click or Enter on an entry: the browser must deliver the event
 * (`isTrusted`), and the menu must have been visible, uncovered and opaque for a while
 * (visibility.ts). Then the service worker checks the frame and its address again and hands the
 * login to the content script of that frame alone (fill/broker.ts).
 */

import { urlValues } from "@kennwort/client/autofill/matches.ts";
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { Button, Icon, m } from "@kennwort/ui";
import { Lock } from "@kennwort/ui/icons";
import { createMemo, createSignal, For, Match, onSettled, Show, Switch } from "solid-js";
import { createEntryLoad } from "../account/load-entries.ts";
import type { PopupAccount } from "../account/popup-account.ts";
import { refreshAlertList } from "../alert/alert-refresh.ts";
import type { MenuAnswer, MenuRequest } from "../fill/messages.ts";
import { forPage } from "../popup/view.ts";
import {
  ARM_AFTER_MS,
  CONFIRM_MS,
  createVisibilityGuard,
  type VisibilityGuard,
  watchVisibility,
} from "./visibility.ts";

/** What the menu needs from the browser; tests pass fakes */
export type MenuBridge = {
  nonce: string;
  /** A message to the service worker; undefined when nothing answered */
  request: (request: MenuRequest) => Promise<MenuAnswer | undefined>;
  now: () => number;
  /** Whether the browser reports visibility (IntersectionObserver v2) */
  verifiable: boolean;
  /** Whether the browser delivered the event (not made up by a script) */
  trusted?: (event: Event) => boolean;
  /** Waits; tests pass one that does not */
  wait?: (ms: number) => Promise<void>;
  Observer?: Parameters<typeof watchVisibility>[3];
};

const entryButtons = (root: HTMLElement | undefined) =>
  Array.from(root?.querySelectorAll<HTMLButtonElement>("button[data-entry]") ?? []);

/** ↑↓ move between the entries, Esc closes the menu and hands the keyboard back to the field */
const onKeys =
  (root: () => HTMLElement | undefined, close: () => void) => (event: KeyboardEvent) => {
    if (event.key === "Escape") return close();
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = entryButtons(root());
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? at + 1 : at - 1;
    event.preventDefault();
    buttons[(next + buttons.length) % buttons.length]?.focus();
  };

const Entries = (props: {
  account: PopupAccount;
  host: string;
  bridge: MenuBridge;
  guard: VisibilityGuard;
  onNote: (note: string | undefined) => void;
}) => {
  const { load, entries, start } = createEntryLoad(props.account, {
    policy: false,
    onEntries: refreshAlertList,
  });
  const matches = createMemo(() => forPage(entries(), props.host));
  onSettled(() => void start());

  const fill = async (entry: ShownEntry, event: MouseEvent) => {
    const trusted = props.bridge.trusted ?? ((e: Event) => e.isTrusted);
    const wait = props.bridge.wait ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
    if (!trusted(event) || !props.guard.armed(props.bridge.now()))
      return props.onNote(m.inline_menu_hidden());
    // Still visible once the browser had time to report a cover laid over it just before the click
    await wait(CONFIRM_MS);
    if (!props.guard.armed(props.bridge.now())) return props.onNote(m.inline_menu_hidden());
    props.onNote(undefined);
    const answer = await props.bridge.request({
      type: "menu-fill",
      nonce: props.bridge.nonce,
      addresses: urlValues(entry),
      username: entry.username,
      password: entry.password,
    });
    if (answer?.ok) return;
    props.onNote(
      answer?.error === "menu-hidden" ? m.inline_menu_hidden() : m.inline_menu_not_filled(),
    );
  };

  return (
    <Switch>
      <Match when={load() === "loading"}>
        <p role="status" class="px-3 py-2 text-xs text-muted-foreground">
          {m.popup_loading()}
        </p>
      </Match>
      <Match when={load() === "failed" || load() === "untrusted"}>
        <p role="alert" class="px-3 py-2 text-xs text-danger">
          {load() === "untrusted" ? m.popup_untrusted() : m.popup_load_failed()}
        </p>
      </Match>
      <Match when={load() === "ready"}>
        <Show
          when={matches().length > 0}
          fallback={<p class="px-3 py-2 text-xs text-muted-foreground">{m.popup_no_matches()}</p>}
        >
          <ul class="grid gap-0.5 p-1">
            <For each={matches()}>
              {(entry) => (
                <li>
                  <button
                    type="button"
                    data-entry
                    aria-label={m.inline_menu_fill({ title: entry.title })}
                    class="group grid w-full rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-transparent"
                    onClick={(event) => void fill(entry, event)}
                  >
                    <span class="truncate text-[13px] font-medium">{entry.title}</span>
                    <span class="truncate text-xs text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground">
                      {entry.username}
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Match>
    </Switch>
  );
};

export const InlineMenu = (props: { account: PopupAccount; bridge: MenuBridge }) => {
  const [page, setPage] = createSignal<MenuAnswer>();
  const [armed, setArmed] = createSignal(false);
  const [note, setNote] = createSignal<string>();
  const guard = createVisibilityGuard();
  let root: HTMLElement | undefined;
  const close = () => void props.bridge.request({ type: "menu-close", nonce: props.bridge.nonce });

  onSettled(() => {
    void props.account.restore();
    void props.bridge
      .request({ type: "menu-page", nonce: props.bridge.nonce })
      .then((answer) => setPage(answer ?? { ok: false, error: "not-delivered" }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shown = false;
    const stop = root
      ? watchVisibility(
          root,
          guard,
          (visible) => {
            if (visible === shown) return;
            shown = visible;
            clearTimeout(timer);
            setArmed(false);
            // Shows in the page (data-armed) when the menu takes clicks; the guard decides
            if (visible)
              timer = setTimeout(() => setArmed(guard.armed(props.bridge.now())), ARM_AFTER_MS);
          },
          props.bridge.Observer,
        )
      : () => {};
    const size = () => {
      const height = Math.ceil(root?.getBoundingClientRect().height ?? 0);
      if (height > 0)
        void props.bridge.request({ type: "menu-size", nonce: props.bridge.nonce, height });
    };
    const resizes = globalThis.ResizeObserver ? new ResizeObserver(size) : undefined;
    if (root) resizes?.observe(root);
    // The content script moves the keyboard here on ↓ in the field
    const focusFirst = () => entryButtons(root)[0]?.focus();
    window.addEventListener("focus", focusFirst);
    return () => {
      stop();
      clearTimeout(timer);
      resizes?.disconnect();
      window.removeEventListener("focus", focusFirst);
    };
  });

  const host = () => {
    const answer = page();
    return answer?.ok ? answer.host : undefined;
  };

  return (
    <main
      ref={(el) => {
        root = el;
      }}
      aria-label={m.inline_menu_frame()}
      data-armed={armed() ? "true" : "false"}
      class="flex flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground"
      onKeyDown={onKeys(() => root, close)}
    >
      <header class="flex items-center gap-2 border-b border-border px-3 py-2">
        <span class="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
          <Icon icon={Lock} size={12} />
        </span>
        <span class="text-[13px] font-semibold">{m.app_name()}</span>
        <span class="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground">
          {host()}
        </span>
      </header>
      <Show when={!props.bridge.verifiable}>
        <p class="px-3 pt-2 text-xs text-warning">{m.inline_menu_unverified()}</p>
      </Show>
      <Show when={note()}>
        {(text) => (
          <p role="alert" class="px-3 pt-2 text-xs text-danger">
            {text()}
          </p>
        )}
      </Show>
      <Switch>
        <Match when={page() !== undefined && !page()?.ok}>
          <p class="px-3 py-2 text-xs text-muted-foreground">{m.inline_menu_foreign()}</p>
        </Match>
        <Match
          when={
            page()?.ok &&
            (props.account.phase() === "locked" || props.account.phase() === "connect")
          }
        >
          <div class="grid gap-2 px-3 py-2">
            <p class="text-[13px] font-medium">
              {props.account.phase() === "locked" ? m.unlock_title() : m.popup_connect_title()}
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void props.bridge.request({ type: "menu-unlock" })}
            >
              {m.inline_menu_unlock()}
            </Button>
          </div>
        </Match>
        <Match when={props.account.phase() === "open" && host()}>
          {(exact) => (
            <Entries
              account={props.account}
              host={exact()}
              bridge={props.bridge}
              guard={guard}
              onNote={setNote}
            />
          )}
        </Match>
        <Match when={true}>
          <p role="status" class="px-3 py-2 text-xs text-muted-foreground">
            {m.popup_loading()}
          </p>
        </Match>
      </Switch>
      <footer class="border-t border-border bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">
        {m.inline_menu_keys()}
      </footer>
    </main>
  );
};
