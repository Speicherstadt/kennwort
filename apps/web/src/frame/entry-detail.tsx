/** One entry: header with title, vault and last change, the field card, access and history (DESIGN.md, Aufbau) */
import { Button, cn, getLocale, Icon, m, type Toasts } from "@kennwort/ui";
import { ArrowLeft, Pencil, Share2 } from "@kennwort/ui/icons";
import { For, Show } from "solid-js";
import { entries as demoEntries, vaultName as demoVaultName } from "../demo.ts";
import type { ShownEntry } from "../entries/entries.ts";
import { typeLabel } from "../entries/entry-types.ts";
import type { Navigation } from "../navigation.ts";
import { type ListFilter, routePath } from "../routes.ts";
import { entryIcon } from "./entry-icon.ts";
import { Link } from "./link.tsx";
import { Field } from "./secret-field.tsx";
import { TotpField } from "./totp-field.tsx";

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

const Detail = (props: {
  entry: ShownEntry;
  toasts: Toasts;
  vaultName: (id: string) => string;
  onEdit?: (() => void) | undefined;
}) => (
  <div class="grid gap-5 p-4 md:p-6 xl:grid-cols-[1fr_16rem]">
    <div class="grid content-start gap-5">
      <div class="flex flex-wrap items-center gap-3">
        <span class="grid size-14 place-items-center rounded-xl border border-border md:size-10">
          <Icon icon={entryIcon[props.entry.type]} size={22} />
        </span>
        <div class="grid min-w-0 flex-1">
          <h1 class="truncate text-[28px] font-semibold md:text-lg">{props.entry.title}</h1>
          <p class="text-xs text-muted-foreground">
            {typeLabel(props.entry.type)} ·{" "}
            {m.detail_in_vault({ name: props.vaultName(props.entry.vault) })}
            <Show when={props.entry.changedAt > 0}>
              {" · "}
              {m.detail_changed({ date: date(props.entry.changedAt) })}
            </Show>
          </p>
        </div>
        <div class="flex gap-2">
          <Button>
            <Icon icon={Share2} /> {m.detail_share()}
          </Button>
          <Button variant="primary" disabled={!props.onEdit} onClick={() => props.onEdit?.()}>
            <Icon icon={Pencil} /> {m.detail_edit()}
          </Button>
        </div>
      </div>
      <Card title={m.detail_fields()}>
        <For each={props.entry.fields.filter((f) => f.value !== "")}>
          {(f) =>
            f.kind === "totp" ? (
              <TotpField label={f.label} value={f.value} toasts={props.toasts} />
            ) : (
              <Field
                label={f.label}
                value={f.value}
                secret={f.kind === "secret"}
                mono={f.kind === "url"}
                multiline={f.kind === "note"}
                toasts={props.toasts}
              />
            )
          }
        </For>
      </Card>
    </div>
    <Show when={props.entry.access.length > 0 || props.entry.changedAt > 0}>
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
    </Show>
  </div>
);

export const EntryDetail = (props: {
  nav: Navigation;
  filter: ListFilter;
  selected: string | undefined;
  toasts: Toasts;
  /** The entries from the vaults (K-306), their vaults' names and how to change one */
  entries?: ShownEntry[] | undefined;
  vaultName?: ((id: string) => string) | undefined;
  onEdit?: ((entry: ShownEntry) => void) | undefined;
}) => {
  const entry = () =>
    (props.entries ?? demoEntries).find((candidate) => candidate.id === props.selected);
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
        {(found) => (
          <Detail
            entry={found}
            toasts={props.toasts}
            vaultName={props.vaultName ?? demoVaultName}
            onEdit={
              props.onEdit && found.editable !== false ? () => props.onEdit?.(found) : undefined
            }
          />
        )}
      </Show>
    </section>
  );
};
