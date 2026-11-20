/** The sidebar from lg: company, the lists, vaults and groups, the note on encryption at the bottom */
import { Badge, cn, Icon, m } from "@kennwort/ui";
import type { IconNode } from "@kennwort/ui/icons";
import { Archive, List, ShieldCheck, Star, TriangleExclamationPoint } from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";
import { company, entries, groups, vaults } from "../demo.ts";
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

const Heading = (props: { children: JSX.Element }) => (
  <h2 class="mt-4 mb-1 px-2 text-[11px] font-semibold tracking-[.04em] text-muted-foreground uppercase">
    {props.children}
  </h2>
);

/** The vaults the app loaded, or the demo's while there are none (K-305 replaces them) */
const sidebarVaults = (loaded: ShownVault[] | undefined) =>
  loaded ? loaded.map((v) => ({ id: v.idText, name: v.name ?? m.vaults_unnamed() })) : vaults;

export const Sidebar = (props: { nav: Navigation; vaults?: ShownVault[] | undefined }) => (
  <aside
    class="hidden w-58 shrink-0 flex-col border-r border-border bg-muted p-3 lg:flex"
    aria-label={m.nav_sections()}
  >
    <p class="px-2 py-1 font-semibold">{company.name}</p>
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
        trailing={<Badge tone="warning">{entries.filter((entry) => entry.weak).length}</Badge>}
      />
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
    </nav>
    <p class="mt-auto flex gap-2 px-2 text-xs text-muted-foreground">
      <Icon icon={ShieldCheck} class="shrink-0 text-success" />
      {m.sidebar_encrypted()}
    </p>
  </aside>
);
