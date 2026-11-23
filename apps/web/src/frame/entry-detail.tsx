/**
 * One entry: header with title, vault, last change, star and buttons, the tags, why it is
 * „Zum Ändern“, the field card, the earlier passwords, access and history (DESIGN.md, Aufbau)
 */

import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { entryIcon } from "@kennwort/client/entries/entry-icon.ts";
import { typeLabel } from "@kennwort/client/entries/entry-types.ts";
import { Button, cn, getLocale, Icon, m, type Toasts } from "@kennwort/ui";
import { ArrowLeft, Link2, Pencil, QrCode, Share2 } from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";
import { entries as demoEntries, vaultName as demoVaultName } from "../demo.ts";
import type { Navigation } from "../navigation.ts";
import { type ListFilter, routePath } from "../routes.ts";
import {
  Card,
  FavoriteButton,
  HistoryCard,
  type Saved,
  TagList,
  ToChangeNote,
} from "./entry-detail-parts.tsx";
import { Link } from "./link.tsx";
import { Field } from "./secret-field.tsx";
import { TotpField } from "./totp-field.tsx";

const date = (time: number) =>
  new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(time);

/**
 * The detail's buttons: the star and „Bearbeiten“ (the one primary action) beside the title, the
 * ways to pass the entry on in a quiet row below; each greyed out where this account may not use it
 */
const SecondaryActions = (props: {
  onShare?: (() => void) | undefined;
  onLink?: (() => void) | undefined;
  onLabel?: (() => void) | undefined;
}) => (
  <div class="flex flex-wrap gap-1.5">
    <Button
      size="sm"
      class="h-11 md:h-7"
      disabled={!props.onShare}
      onClick={() => props.onShare?.()}
    >
      <Icon icon={Share2} /> {m.detail_share()}
    </Button>
    <Button size="sm" class="h-11 md:h-7" disabled={!props.onLink} onClick={() => props.onLink?.()}>
      <Icon icon={Link2} /> {m.detail_link()}
    </Button>
    <Show when={props.onLabel}>
      {(open) => (
        <Button size="sm" class="h-11 md:h-7" onClick={() => open()()}>
          <Icon icon={QrCode} /> {m.detail_label()}
        </Button>
      )}
    </Show>
  </div>
);

const Detail = (props: {
  entry: ShownEntry;
  toasts: Toasts;
  vaultName: (id: string) => string;
  onEdit?: (() => void) | undefined;
  onShare?: (() => void) | undefined;
  onLink?: (() => void) | undefined;
  onLabel?: (() => void) | undefined;
  onFavorite?: (() => Promise<Saved> | undefined) | undefined;
}) => (
  <div class="mx-auto grid w-full max-w-5xl gap-5 p-4 md:p-6 @3xl:grid-cols-[minmax(0,1fr)_16rem]">
    <div class="grid content-start gap-5">
      <div class="flex flex-wrap items-center gap-3">
        <span class="grid size-14 place-items-center rounded-xl border border-border md:size-10">
          <Icon icon={entryIcon[props.entry.type]} size={22} />
        </span>
        <div class="grid min-w-0 flex-1 basis-48">
          <h1 class="truncate text-[28px] font-semibold md:text-lg">{props.entry.title}</h1>
          <p class="text-xs text-muted-foreground">
            {typeLabel(props.entry.type)} ·{" "}
            {props.entry.sharedBy === undefined
              ? m.detail_in_vault({ name: props.vaultName(props.entry.vault) })
              : m.detail_shared_by({ name: props.entry.sharedBy })}
            <Show when={props.entry.changedAt > 0}>
              {" · "}
              {m.detail_changed({ date: date(props.entry.changedAt) })}
            </Show>
          </p>
        </div>
        <div class="flex items-center gap-1">
          <FavoriteButton
            favorite={props.entry.favorite}
            toasts={props.toasts}
            onToggle={props.onFavorite}
          />
          <Button
            variant="primary"
            class="h-11 md:h-8"
            disabled={!props.onEdit}
            onClick={() => props.onEdit?.()}
          >
            <Icon icon={Pencil} /> {m.detail_edit()}
          </Button>
        </div>
      </div>
      <SecondaryActions onShare={props.onShare} onLink={props.onLink} onLabel={props.onLabel} />
      <TagList tags={props.entry.tags} />
      <ToChangeNote entry={props.entry} />
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
      <HistoryCard entry={props.entry} toasts={props.toasts} />
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
  /** Opens sharing for an entry of a vault this account may edit (P-10) */
  onShare?: ((entry: ShownEntry) => void) | undefined;
  /** Opens a one-time link for an entry of a vault this account may edit (K-601) */
  onLink?: ((entry: ShownEntry) => void) | undefined;
  /** A QR label for the device the entry is for (K-605); not for an entry shared with this account */
  onLabel?: ((entry: ShownEntry) => void) | undefined;
  /** Marks an entry of a vault this account may edit as a favorite, or no longer (K-306 part 5) */
  onFavorite?: ((entry: ShownEntry) => Promise<Saved>) | undefined;
  /** The inline editor, shown in this pane instead of the entry while it is open */
  editor?: (() => JSX.Element) | undefined;
}) => {
  const entry = () =>
    (props.entries ?? demoEntries).find((candidate) => candidate.id === props.selected);
  return (
    <section
      class={cn(
        "@container min-h-0 flex-1 overflow-auto",
        !props.selected && !props.editor && "hidden md:block",
      )}
    >
      <Show when={props.editor} fallback={<Shown {...props} entry={entry()} />}>
        {(editor) => editor()()}
      </Show>
    </section>
  );
};

/** The entry chosen in the URL, with the phone's way back to the list */
const Shown = (
  props: Omit<Parameters<typeof EntryDetail>[0], "entries" | "editor"> & {
    entry: ShownEntry | undefined;
  },
) => {
  const entry = () => props.entry;
  return (
    <>
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
            onShare={
              props.onShare && found.editable !== false && found.sharedBy === undefined
                ? () => props.onShare?.(found)
                : undefined
            }
            onLink={
              props.onLink && found.editable !== false && found.sharedBy === undefined
                ? () => props.onLink?.(found)
                : undefined
            }
            onLabel={
              props.onLabel && found.sharedBy === undefined
                ? () => props.onLabel?.(found)
                : undefined
            }
            onFavorite={
              props.onFavorite && found.editable !== false && found.sharedBy === undefined
                ? () => props.onFavorite?.(found)
                : undefined
            }
          />
        )}
      </Show>
    </>
  );
};
