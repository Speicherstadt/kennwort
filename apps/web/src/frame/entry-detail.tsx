/** One entry: header with title, vault and last change, the field card, access and history (DESIGN.md, Aufbau) */
import { Button, cn, getLocale, Icon, m, type Toasts } from "@kennwort/ui";
import { ArrowLeft, KeyRound, Pencil, Share2 } from "@kennwort/ui/icons";
import { For, Show } from "solid-js";
import { type DemoEntry, entries, vaultName } from "../demo.ts";
import type { Navigation } from "../navigation.ts";
import { type ListFilter, routePath } from "../routes.ts";
import { Link } from "./link.tsx";
import { Field } from "./secret-field.tsx";

const date = (time: number) =>
  new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(time);

const Card = (props: { title: string; children: unknown }) => (
  <section class="grid gap-1" aria-label={props.title}>
    <h2 class="text-[11px] font-semibold tracking-[.04em] text-muted-foreground uppercase">
      {props.title}
    </h2>
    <div class="divide-y divide-border rounded-xl border border-border">
      {props.children as never}
    </div>
  </section>
);

const Detail = (props: { entry: DemoEntry; toasts: Toasts }) => (
  <div class="grid gap-5 p-4 md:p-6 xl:grid-cols-[1fr_16rem]">
    <div class="grid content-start gap-5">
      <div class="flex flex-wrap items-center gap-3">
        <span class="grid size-14 place-items-center rounded-xl border border-border md:size-10">
          <Icon icon={KeyRound} size={22} />
        </span>
        <div class="grid min-w-0 flex-1">
          <h1 class="truncate text-[28px] font-semibold md:text-lg">{props.entry.title}</h1>
          <p class="text-xs text-muted-foreground">
            {m.detail_in_vault({ name: vaultName(props.entry.vault) })} ·{" "}
            {m.detail_changed({ date: date(props.entry.changedAt) })}
          </p>
        </div>
        <div class="flex gap-2">
          <Button>
            <Icon icon={Share2} /> {m.detail_share()}
          </Button>
          <Button variant="primary">
            <Icon icon={Pencil} /> {m.detail_edit()}
          </Button>
        </div>
      </div>
      <Card title={m.detail_fields()}>
        <Field label={m.field_username()} value={props.entry.username} toasts={props.toasts} />
        <Field
          label={m.field_password()}
          value={props.entry.password}
          secret
          toasts={props.toasts}
        />
        <Show when={props.entry.website}>
          <Field label={m.field_website()} value={props.entry.website} mono toasts={props.toasts} />
        </Show>
      </Card>
    </div>
    <div class="grid content-start gap-5">
      <Card title={m.detail_access()}>
        <For each={props.entry.access}>{(person) => <p class="px-3.5 py-2">{person}</p>}</For>
      </Card>
      <Card title={m.detail_history()}>
        <p class="px-3.5 py-2 text-xs text-muted-foreground">
          {m.detail_changed_by({ name: props.entry.changedBy })} · {date(props.entry.changedAt)}
        </p>
      </Card>
    </div>
  </div>
);

export const EntryDetail = (props: {
  nav: Navigation;
  filter: ListFilter;
  selected: string | undefined;
  toasts: Toasts;
}) => {
  const entry = () => entries.find((candidate) => candidate.id === props.selected);
  return (
    <section class={cn("min-h-0 flex-1 overflow-auto", !props.selected && "hidden md:block")}>
      <Show when={props.selected}>
        <Link
          nav={props.nav}
          href={routePath({ page: "entries", filter: props.filter })}
          class="flex min-h-11 items-center gap-1 px-4 pt-2 text-[15px] md:hidden"
        >
          <Icon icon={ArrowLeft} /> {m.detail_back()}
        </Link>
      </Show>
      {/* Keyed: another entry is a new view, so nothing revealed carries over (review of K-302) */}
      <Show
        when={entry()}
        keyed
        fallback={
          <p class="grid h-full place-items-center p-8 text-muted-foreground">
            {props.selected ? m.detail_not_found() : m.detail_none()}
          </p>
        }
      >
        {(found) => <Detail entry={found} toasts={props.toasts} />}
      </Show>
    </section>
  );
};
