/**
 * Entries in the popup (DESIGN.md, Extension-Popup): icon, title and what is shown under it, and
 * copy buttons for the user name and the password. Copying needs a click; nothing is filled in
 * (that comes with K-403, P-17). The password never shows in the popup.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { entryIcon } from "@kennwort/client/entries/entry-icon.ts";
import { copyText, Icon, IconButton, m, type Toasts } from "@kennwort/ui";
import { type IconNode, KeyRound, Star, User } from "@kennwort/ui/icons";
import { createUniqueId, For, Show } from "solid-js";

const CopyButton = (props: {
  field: string;
  icon: IconNode;
  title: string;
  value: string;
  toasts: Toasts;
}) => (
  <IconButton
    label={m.popup_copy({ field: props.field, title: props.title })}
    onClick={() => copyText(props.value, props.field, props.toasts)}
  >
    <Icon icon={props.icon} />
  </IconButton>
);

const EntryRow = (props: { entry: ShownEntry; toasts: Toasts }) => (
  <li class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
    <span class="grid size-7 shrink-0 place-items-center rounded-md border border-border">
      <Icon icon={entryIcon[props.entry.type]} size={14} />
    </span>
    <span class="grid min-w-0 flex-1">
      <span class="flex items-center gap-1 truncate text-[13px] font-medium">
        {props.entry.title}
        <Show when={props.entry.favorite}>
          <Icon icon={Star} size={12} label={m.detail_favorite()} class="shrink-0 text-warning" />
        </Show>
      </span>
      <span class="truncate text-xs text-muted-foreground">{props.entry.subtitle}</span>
    </span>
    <Show when={props.entry.username}>
      {(username) => (
        <CopyButton
          field={m.field_username()}
          icon={User}
          title={props.entry.title}
          value={username()}
          toasts={props.toasts}
        />
      )}
    </Show>
    <Show when={props.entry.password}>
      {(password) => (
        <CopyButton
          field={m.field_password()}
          icon={KeyRound}
          title={props.entry.title}
          value={password()}
          toasts={props.toasts}
        />
      )}
    </Show>
  </li>
);

/** A titled group of entries, or a line that says why there are none */
export const EntrySection = (props: {
  title: string;
  entries: readonly ShownEntry[];
  empty: string;
  toasts: Toasts;
}) => {
  const id = createUniqueId();
  return (
    <section aria-labelledby={id} class="grid gap-1 pb-2">
      <h2
        id={id}
        class="px-2 pt-2 text-[11px] font-medium tracking-[.04em] text-muted-foreground uppercase"
      >
        {props.title}
      </h2>
      <Show
        when={props.entries.length > 0}
        fallback={<p class="px-2 text-xs text-muted-foreground">{props.empty}</p>}
      >
        <ul class="grid gap-0.5">
          <For each={props.entries}>
            {(entry) => <EntryRow entry={entry} toasts={props.toasts} />}
          </For>
        </ul>
      </Show>
    </section>
  );
};
