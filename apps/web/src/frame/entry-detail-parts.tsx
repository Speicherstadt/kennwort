/**
 * Parts of an entry's detail (K-306 part 5): the favorite star, the tags, why the entry is
 * „Zum Ändern“ and its earlier passwords, masked until revealed like every secret
 */
import { Badge, getLocale, Icon, IconButton, m, type Toasts } from "@kennwort/ui";
import { Star, TriangleExclamationPoint } from "@kennwort/ui/icons";
import { createSignal, For, Show } from "solid-js";
import type { ShownEntry } from "../entries/entries.ts";
import type { SaveError } from "../entries/entry-store.ts";
import { toChange } from "../entries/to-change.ts";
import { Field } from "./secret-field.tsx";

export type Saved = { ok: true; value: string } | { ok: false; error: SaveError };

const date = (time: number) =>
  new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(time);

export const Card = (props: { title: string; children: unknown }) => (
  <section class="grid gap-1" aria-label={props.title}>
    <h2 class="text-[11px] font-semibold tracking-[.04em] text-muted-foreground uppercase">
      {props.title}
    </h2>
    <div class="divide-y divide-border rounded-xl border border-border">
      {props.children as never}
    </div>
  </section>
);

/** The star: pressed for a favorite; only who may edit the entry can press it */
export const FavoriteButton = (props: {
  favorite: boolean;
  toasts: Toasts;
  onToggle?: (() => Promise<Saved> | undefined) | undefined;
}) => {
  const [busy, setBusy] = createSignal(false);
  const toggle = async () => {
    setBusy(true);
    const saved = await props.onToggle?.();
    setBusy(false);
    if (saved && !saved.ok) props.toasts.show(m.detail_favorite_failed(), "danger");
  };
  return (
    <IconButton
      label={m.detail_favorite()}
      aria-pressed={props.favorite ? "true" : "false"}
      disabled={!props.onToggle || busy()}
      onClick={toggle}
    >
      <Icon icon={Star} class={props.favorite ? "fill-current text-warning" : ""} />
    </IconButton>
  );
};

export const TagList = (props: { tags: string[] }) => (
  <Show when={props.tags.length > 0}>
    <ul class="flex flex-wrap gap-1.5" aria-label={m.detail_tags()}>
      <For each={props.tags}>
        {(tag) => (
          <li>
            <Badge>{tag}</Badge>
          </li>
        )}
      </For>
    </ul>
  </Show>
);

/** Why the entry is „Zum Ändern“: a weak password, one used in other entries too, or both */
export const ToChangeNote = (props: { entry: ShownEntry }) => (
  <Show when={toChange(props.entry)}>
    <div
      role="note"
      aria-label={m.nav_to_change()}
      class="grid gap-1 rounded-xl border border-warning px-3.5 py-2.5 text-[13px]"
    >
      <p class="flex items-center gap-2 font-medium text-warning">
        <Icon icon={TriangleExclamationPoint} /> {m.nav_to_change()}
      </p>
      <Show when={props.entry.weak}>
        <p>{m.detail_weak()}</p>
      </Show>
      <Show when={props.entry.reused > 1}>
        <p>{m.detail_reused({ count: props.entry.reused })}</p>
      </Show>
    </div>
  </Show>
);

/** The earlier passwords, newest first, each with when it was replaced */
export const HistoryCard = (props: { entry: ShownEntry; toasts: Toasts }) => (
  <Show when={props.entry.history.length > 0}>
    <Card title={m.detail_earlier()}>
      <For each={props.entry.history}>
        {(item) => (
          <Field
            label={m.detail_earlier_item({
              field: item.label,
              date: date(item.replacedAt * 1000),
            })}
            value={item.value}
            secret
            toasts={props.toasts}
          />
        )}
      </For>
    </Card>
  </Show>
);
