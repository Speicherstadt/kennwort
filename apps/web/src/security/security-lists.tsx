/**
 * The lists of the security overview (K-603): one section per reason, each row the entry's title
 * and what the list says under it (never a password), a link to the entry, and „Jetzt ändern“ to
 * the site's page for changing a password (change-password.ts) in a new tab, without opener or
 * referrer, so the site neither reaches back into Kennwort nor learns where the person came from.
 */
import { changeLink } from "@kennwort/client/entries/change-password.ts";
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { buttonClass, m } from "@kennwort/ui";
import { For, Show } from "solid-js";
import { Link } from "../frame/link.tsx";
import type { Navigation } from "../navigation.ts";

export const ChangeNow = (props: { entry: ShownEntry }) => (
  <Show when={changeLink(props.entry.website)}>
    {(link) => (
      <a
        href={link().url}
        target="_blank"
        rel="noopener noreferrer"
        referrerpolicy="no-referrer"
        aria-label={m.security_change_now_of({ title: props.entry.title })}
        class={[buttonClass({ size: "sm" }), "min-h-11 md:min-h-0"]}
      >
        {m.security_change_now()}
      </a>
    )}
  </Show>
);

const Row = (props: { nav: Navigation; entry: ShownEntry; note: string }) => (
  <li class="flex items-center gap-2 px-3 py-2">
    <Link
      nav={props.nav}
      href={`/entries/${encodeURIComponent(props.entry.id)}`}
      class="grid min-w-0 flex-1 gap-0.5 hover:underline"
    >
      <span class="truncate font-medium">{props.entry.title}</span>
      <span class="truncate text-xs text-muted-foreground">{props.note}</span>
    </Link>
    <ChangeNow entry={props.entry} />
  </li>
);

/** A reason with its entries; `note` says per entry what the row shows under the title */
export const ReasonList = (props: {
  nav: Navigation;
  id: string;
  title: string;
  entries: ShownEntry[] | undefined;
  note: (entry: ShownEntry) => string;
  /** Shown instead of the list, e.g. while the leak check is off */
  instead?: string | undefined;
}) => (
  <section aria-labelledby={props.id} class="grid content-start gap-2">
    <h2 id={props.id} class="text-sm font-semibold">
      {props.title}
    </h2>
    <Show
      when={!props.instead && (props.entries ?? []).length > 0}
      fallback={
        <p class="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          {props.instead ?? m.security_none()}
        </p>
      }
    >
      <ul aria-label={props.title} class="divide-y divide-border rounded-xl border border-border">
        <For each={props.entries}>
          {(entry) => <Row nav={props.nav} entry={entry} note={props.note(entry)} />}
        </For>
      </ul>
    </Show>
  </section>
);

/** The four counts at the top; leaked is undefined while the check is off */
export const Counts = (props: {
  weak: number;
  reused: number;
  leaked: number | undefined;
  marked: number;
}) => (
  <dl class="grid grid-cols-2 gap-2 md:grid-cols-4">
    <For
      each={
        [
          [m.security_weak(), props.weak],
          [m.security_reused(), props.reused],
          [m.security_leaked(), props.leaked],
          [m.security_marked(), props.marked],
        ] as const
      }
    >
      {([label, count]) => (
        <div class="grid gap-1 rounded-xl border border-border px-4 py-3">
          <dt class="text-xs text-muted-foreground">{label}</dt>
          <dd
            class={
              count === undefined
                ? "text-[13px] font-medium text-muted-foreground"
                : "text-2xl font-semibold tabular-nums"
            }
          >
            {count ?? m.security_not_checked()}
          </dd>
        </div>
      )}
    </For>
  </dl>
);
