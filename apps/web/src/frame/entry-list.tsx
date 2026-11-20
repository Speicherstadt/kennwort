/**
 * The list of entries: title of the list, search ("/"), on the phone the filter chips; choosing an
 * entry opens it in the URL, so the phone shows it on its own screen (DESIGN.md, Aufbau)
 */
import { Badge, Button, cn, Icon, List, m, SearchInput } from "@kennwort/ui";
import { KeyRound, Plus } from "@kennwort/ui/icons";
import { createMemo, createSignal, For, Show } from "solid-js";
import { entries as demoEntries, vaultName } from "../demo.ts";
import type { ShownEntry } from "../entries/entries.ts";
import { shownEntries } from "../filter.ts";
import type { Navigation } from "../navigation.ts";
import { type ListFilter, routePath } from "../routes.ts";
import { Link } from "./link.tsx";

/** A vault the app loaded (K-305); the demo vaults stand in where there is none */
export type ShownVault = { idText: string; name: string | undefined };

export const listTitle = (filter: ListFilter, vaults: ShownVault[] = []) =>
  filter.kind === "all"
    ? m.nav_all()
    : filter.kind === "favorites"
      ? m.nav_favorites()
      : filter.kind === "to-change"
        ? m.nav_to_change()
        : (vaults.find((v) => v.idText === filter.id)?.name ?? vaultName(filter.id));

const chips = (entries: readonly ShownEntry[]) => [
  { href: "/entries", kind: "all", label: m.chip_all() },
  { href: "/favorites", kind: "favorites", label: m.nav_favorites() },
  {
    href: "/to-change",
    kind: "to-change",
    label: m.chip_to_change({ count: entries.filter((e) => e.weak).length }),
  },
];

export const EntryList = (props: {
  nav: Navigation;
  filter: ListFilter;
  selected: string | undefined;
  vaults?: ShownVault[] | undefined;
  /** The entries from the vaults (K-306); the demo's while the app gives none */
  entries?: ShownEntry[] | undefined;
  onNew?: (() => void) | undefined;
}) => {
  const [search, setSearch] = createSignal("");
  const all = () => props.entries ?? demoEntries;
  const shown = createMemo(() => shownEntries(all(), props.filter, search()));
  return (
    <section
      aria-labelledby="list-title"
      class={cn(
        "min-h-0 w-full flex-col border-border md:w-85 md:shrink-0 md:border-r",
        // One display class only: with flex and hidden both set, the CSS order decides
        props.selected ? "hidden md:flex" : "flex",
      )}
    >
      <div class="grid gap-3 p-4 pb-2 md:p-3">
        <div class="flex items-center gap-2">
          <h1 id="list-title" class="flex-1 text-[28px] font-semibold md:text-[15px]">
            {listTitle(props.filter, props.vaults)}
          </h1>
          <Show when={props.onNew}>
            {(onNew) => (
              <Button onClick={() => onNew()()}>
                <Icon icon={Plus} /> {m.entry_new()}
              </Button>
            )}
          </Show>
        </div>
        <SearchInput
          label={m.list_search()}
          placeholder={m.list_search_placeholder()}
          shortcut="/"
          value={search()}
          onInput={(event) => setSearch(event.currentTarget.value)}
        />
        <nav aria-label={m.list_filters()} class="flex gap-2 md:hidden">
          <For each={chips(all())}>
            {(chip) => (
              <Link
                nav={props.nav}
                href={chip.href}
                current={props.filter.kind === chip.kind}
                class={cn(
                  "flex min-h-11 items-center rounded-full border border-border px-3 text-[13px]",
                  props.filter.kind === chip.kind && "bg-primary text-primary-foreground",
                )}
              >
                {chip.label}
              </Link>
            )}
          </For>
        </nav>
      </div>
      <div class="min-h-0 flex-1 overflow-auto px-2 pb-2">
        <Show
          when={shown().length > 0}
          fallback={<p class="p-4 text-muted-foreground">{m.list_empty()}</p>}
        >
          <List
            label={listTitle(props.filter, props.vaults)}
            selected={props.selected}
            onSelect={(id) =>
              props.nav.go(routePath({ page: "entries", filter: props.filter, entry: id }))
            }
            items={shown().map((entry) => ({
              id: entry.id,
              label: entry.title,
              description: entry.username,
              leading: (
                <span class="grid size-10 shrink-0 place-items-center rounded-lg border border-border md:size-8">
                  <Icon icon={KeyRound} />
                </span>
              ),
              trailing: entry.weak ? <Badge tone="warning">{m.badge_change()}</Badge> : undefined,
            }))}
          />
        </Show>
      </div>
    </section>
  );
};
