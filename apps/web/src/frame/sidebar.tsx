/** The sidebar from lg: company, the lists, vaults and groups, the note on encryption at the bottom */

import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { Badge, cn, Icon, m, selectClass } from "@kennwort/ui";
import type { IconNode } from "@kennwort/ui/icons";
import {
  Archive,
  List,
  Share2,
  ShieldCheck,
  ShieldExclamationPoint,
  Star,
  TriangleExclamationPoint,
} from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";
import { company, entries as demoEntries, groups, vaults } from "../demo.ts";
import { toChangeCount } from "../filter.ts";
import type { Navigation } from "../navigation.ts";
import type { ListFilter } from "../routes.ts";
import type { ShownVault } from "./entry-list.tsx";
import { Link } from "./link.tsx";

const sameFilter = (a: ListFilter, b: ListFilter) =>
  a.kind === b.kind && (a.kind !== "vault" || (b.kind === "vault" && a.id === b.id));

const Item = (props: {
  nav: Navigation;
  href: string;
  filter: ListFilter;
  icon: IconNode;
  label: string;
  trailing?: JSX.Element;
}) => {
  const current = () => {
    const route = props.nav.route();
    return route.page === "entries" && sameFilter(route.filter, props.filter);
  };
  return (
    <Link
      nav={props.nav}
      href={props.href}
      current={current()}
      class={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5",
        current() ? "bg-accent text-foreground" : "hover:bg-accent",
      )}
    >
      <Icon icon={props.icon} />
      <span class="flex-1 truncate">{props.label}</span>
      {props.trailing}
    </Link>
  );
};

/** The companies of the account (K-605): which one is on screen and how to put another there */
export type CompanySwitch = {
  options: () => { id: string; name: string }[];
  activeId: () => string | undefined;
  busy: () => boolean;
  onSwitch: (id: string) => void;
};

/** The company's name, or a switch between the companies when the account has more than one */
const CompanyName = (props: { companies?: CompanySwitch | undefined }) => (
  <Show
    when={props.companies && props.companies.options().length > 1 ? props.companies : undefined}
    fallback={<p class="px-2 py-1 font-semibold">{company.name}</p>}
  >
    {(companies) => (
      <select
        aria-label={m.companies_switch()}
        class={cn(selectClass, "mx-2 mb-1 font-semibold")}
        value={companies().activeId()}
        disabled={companies().busy()}
        onChange={(event) => companies().onSwitch(event.currentTarget.value)}
      >
        <For each={companies().options()}>
          {(option) => <option value={option.id}>{option.name}</option>}
        </For>
      </select>
    )}
  </Show>
);

const Heading = (props: { children: JSX.Element }) => (
  <h2 class="mt-4 mb-1 px-2 text-[11px] font-semibold tracking-[.04em] text-muted-foreground uppercase">
    {props.children}
  </h2>
);

/** The vaults the app loaded, or the demo's while there are none (K-305 replaces them) */
const sidebarVaults = (loaded: ShownVault[] | undefined) =>
  loaded ? loaded.map((v) => ({ id: v.idText, name: v.name ?? m.vaults_unnamed() })) : vaults;

export const Sidebar = (props: {
  nav: Navigation;
  vaults?: ShownVault[] | undefined;
  entries?: ShownEntry[] | undefined;
  /** Whether the security overview (K-603) is there to link to */
  security?: boolean | undefined;
  companies?: CompanySwitch | undefined;
}) => (
  <aside
    class="hidden w-58 shrink-0 flex-col border-r border-border bg-muted p-3 lg:flex"
    aria-label={m.nav_sections()}
  >
    <CompanyName companies={props.companies} />
    <nav aria-label={m.nav_entries()} class="grid gap-0.5">
      <Item
        nav={props.nav}
        href="/entries"
        filter={{ kind: "all" }}
        icon={List}
        label={m.nav_all()}
      />
      <Item
        nav={props.nav}
        href="/favorites"
        filter={{ kind: "favorites" }}
        icon={Star}
        label={m.nav_favorites()}
      />
      <Item
        nav={props.nav}
        href="/to-change"
        filter={{ kind: "to-change" }}
        icon={TriangleExclamationPoint}
        label={m.nav_to_change()}
        trailing={<Badge tone="warning">{toChangeCount(props.entries ?? demoEntries)}</Badge>}
      />
      <Show when={props.entries?.some((entry) => entry.sharedBy !== undefined)}>
        <Item
          nav={props.nav}
          href="/shared"
          filter={{ kind: "shared" }}
          icon={Share2}
          label={m.nav_shared()}
        />
      </Show>
      <Show when={props.security}>
        <Link
          nav={props.nav}
          href="/security"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
        >
          <Icon icon={ShieldExclamationPoint} />
          <span class="flex-1 truncate">{m.nav_security()}</span>
        </Link>
      </Show>
      <Heading>{m.nav_vaults()}</Heading>
      <For each={sidebarVaults(props.vaults)}>
        {(vault) => (
          <Item
            nav={props.nav}
            href={`/vaults/${vault.id}`}
            filter={{ kind: "vault", id: vault.id }}
            icon={Archive}
            label={vault.name}
          />
        )}
      </For>
      <Show when={props.vaults}>
        <Link
          nav={props.nav}
          href="/vaults"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent"
        >
          {m.vaults_all()}
        </Link>
      </Show>
      <Heading>{m.nav_groups()}</Heading>
      <Show
        when={!props.vaults}
        fallback={
          <Link
            nav={props.nav}
            href="/groups"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent"
          >
            {m.groups_all()}
          </Link>
        }
      >
        <For each={groups}>
          {(group) => (
            <Link
              nav={props.nav}
              href="/groups"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
            >
              <span class="flex-1 truncate">{group.name}</span>
            </Link>
          )}
        </For>
      </Show>
    </nav>
    <p class="mt-auto flex gap-2 px-2 text-xs text-muted-foreground">
      <Icon icon={ShieldCheck} class="shrink-0 text-success" />
      {m.sidebar_encrypted()}
    </p>
  </aside>
);
