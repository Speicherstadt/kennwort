/**
 * „Team“ (DESIGN.md, Aufbau): one page of its own, without the entries list, with two tabs –
 * Mitglieder and Tresore. Each tab keeps its address (/members, /vaults), so links and bookmarks
 * land here; /team opens the members, /groups redirects to /vaults.
 */
import { cn, m } from "@kennwort/ui";
import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
import type { Navigation } from "../navigation.ts";
import { Link } from "./link.tsx";

export type TeamTab = "members" | "vaults";

const tabs: { tab: TeamTab; href: string; label: () => string }[] = [
  { tab: "members", href: "/members", label: () => m.team_members() },
  { tab: "vaults", href: "/vaults", label: () => m.team_vaults() },
];

export const TeamPage = (props: { nav: Navigation; tab: TeamTab; children: JSX.Element }) => (
  <main id="main-content" tabindex={-1} class="flex min-h-0 flex-1 flex-col">
    <nav
      aria-label={m.nav_team()}
      class="mx-auto flex w-full max-w-6xl gap-1 border-b border-border px-4 pt-3 md:px-8 md:pt-6"
    >
      <For each={tabs}>
        {(item) => (
          <Link
            nav={props.nav}
            href={item.href}
            current={props.tab === item.tab}
            class={cn(
              "-mb-px flex min-h-11 items-center border-b-2 px-3 text-[13px] font-medium transition-colors md:min-h-9",
              props.tab === item.tab
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label()}
          </Link>
        )}
      </For>
    </nav>
    <div class="flex min-h-0 flex-1">{props.children}</div>
  </main>
);
