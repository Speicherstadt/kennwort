/**
 * The list of entries: title of the list, search ("/"), on the phone the filter chips; choosing an
 * entry opens it in the URL, so the phone shows it on its own screen (DESIGN.md, Aufbau)
 */

import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { entryIcon } from "@kennwort/client/entries/entry-icon.ts";
import {
  Badge,
  Button,
  buttonClass,
  cn,
  Icon,
  List,
  m,
  SearchInput,
  toggleVariants,
} from "@kennwort/ui";
import { Plus, Users } from "@kennwort/ui/icons";
import { createMemo, createSignal, For, Show } from "solid-js";
import { entries as demoEntries, vaultName } from "../demo.ts";
import { toChange } from "../entries/to-change.ts";
import { shownEntries, toChangeCount } from "../filter.ts";
import type { Navigation } from "../navigation.ts";
import { type ListFilter, routePath } from "../routes.ts";
import { Link } from "./link.tsx";

/** A vault the app loaded (K-305); the demo vaults stand in where there is none */
export type ShownVault = { idText: string; name: string | undefined };

/** How many people a vault has, where the app loaded its log; one (personal) where not */
export const membersOf = (vault: ShownVault) =>
  (vault as { log?: { members?: ReadonlyMap<string, unknown> } }).log?.members?.size ?? 1;

/** A shared vault's „Zugriff“: who sees it, on its tab of the team page */
const VaultAccess = (props: {
  nav: Navigation;
  filter: ListFilter;
  vaults?: ShownVault[] | undefined;
}) => {
  const vault = () => {
    const f = props.filter;
    return f.kind === "vault" ? props.vaults?.find((v) => v.idText === f.id) : undefined;
  };
  return (
    <Show when={vault() && membersOf(vault() as ShownVault) > 1 ? vault() : undefined}>
      {(shared) => (
        <Link
          nav={props.nav}
          href="/vaults"
          label={m.vault_access_of({ name: shared().name ?? m.vaults_unnamed() })}
          class={cn(buttonClass({ size: "sm" }), "h-11 md:h-7")}
        >
          <Icon icon={Users} /> {m.vault_access()} · {membersOf(shared())}
        </Link>
      )}
    </Show>
  );
};

export const listTitle = (filter: ListFilter, vaults: ShownVault[] = []) =>
  filter.kind === "all"
    ? m.nav_all()
    : filter.kind === "favorites"
      ? m.nav_favorites()
      : filter.kind === "to-change"
        ? m.nav_to_change()
        : filter.kind === "shared"
          ? m.nav_shared()
          : (vaults.find((v) => v.idText === filter.id)?.name ?? vaultName(filter.id));

/** The phone's filters; "Mit mir geteilt" only once something is shared with this account */
const chips = (entries: readonly ShownEntry[], security: boolean) => [
  { href: "/entries", kind: "all", label: m.chip_all() },
  { href: "/favorites", kind: "favorites", label: m.nav_favorites() },
  {
    href: "/to-change",
    kind: "to-change",
    label: m.chip_to_change({ count: toChangeCount(entries) }),
  },
  ...(entries.some((e) => e.sharedBy !== undefined)
    ? [{ href: "/shared", kind: "shared", label: m.nav_shared() }]
    : []),
  // The security overview in the flow of the list, as in the sidebar (K-603)
  ...(security ? [{ href: "/security", kind: "security", label: m.nav_security() }] : []),
];

export const EntryList = (props: {
  nav: Navigation;
  filter: ListFilter;
  selected: string | undefined;
  vaults?: ShownVault[] | undefined;
  /** The entries from the vaults (K-306); the demo's while the app gives none */
  entries?: ShownEntry[] | undefined;
  onNew?: (() => void) | undefined;
  /** The editor has the screen on a phone (a new entry): the list steps aside */
  covered?: boolean | undefined;
  /** Whether the security overview is there to link to, as a chip on the phone */
  security?: boolean | undefined;
}) => {
  const [search, setSearch] = createSignal("");
  const all = () => props.entries ?? demoEntries;
  const shown = createMemo(() => shownEntries(all(), props.filter, search()));
  const items = createMemo(() =>
    shown().map((entry) => ({
      id: entry.id,
      label: entry.title,
      description: entry.subtitle,
      leading: () => (
        <span class="grid size-10 shrink-0 place-items-center rounded-lg border border-border md:size-8">
          <Icon icon={entryIcon[entry.type]} />
        </span>
      ),
      trailing: toChange(entry)
        ? () => <Badge tone="warning">{m.badge_change()}</Badge>
        : undefined,
    })),
  );
  return (
    <section
      aria-labelledby="list-title"
      class={cn(
        "min-h-0 w-full flex-col border-border md:w-85 md:shrink-0 md:border-r",
        // One display class only: with flex and hidden both set, the CSS order decides
        props.selected || props.covered ? "hidden md:flex" : "flex",
      )}
    >
      <div class="grid gap-3 p-4 pb-2 md:p-3">
        <div class="flex items-center gap-2">
          <h1 id="list-title" class="flex-1 text-[28px] font-semibold md:text-[15px]">
            {listTitle(props.filter, props.vaults)}
          </h1>
          <VaultAccess nav={props.nav} filter={props.filter} vaults={props.vaults} />
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
        <nav aria-label={m.list_filters()} class="flex flex-wrap gap-2 md:hidden">
          <For each={chips(all(), props.security === true)}>
            {(chip) => (
              <Link
                nav={props.nav}
                href={chip.href}
                current={props.filter.kind === chip.kind}
                class="flex min-h-11 items-center"
              >
                <span
                  class={toggleVariants()}
                  data-state={props.filter.kind === chip.kind ? "on" : "off"}
                >
                  {chip.label}
                </span>
              </Link>
            )}
          </For>
        </nav>
      </div>
      <div class="min-h-0 flex-1 overflow-auto px-2 pb-2">
        <Show
          when={shown().length > 0}
          fallback={
            <p class="m-2 rounded-xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
              {m.list_empty()}
            </p>
          }
        >
          <List
            label={listTitle(props.filter, props.vaults)}
            selected={props.selected}
            onSelect={(id) =>
              props.nav.go(routePath({ page: "entries", filter: props.filter, entry: id }))
            }
            items={items()}
          />
        </Show>
      </div>
    </section>
  );
};
