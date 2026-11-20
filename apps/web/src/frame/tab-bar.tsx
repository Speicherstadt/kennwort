/** The phone's tab bar: the four sections, touch targets of at least 44 px (DESIGN.md) */
import { cn, Icon, m } from "@kennwort/ui";
import { For } from "solid-js";
import type { Navigation } from "../navigation.ts";
import { Link } from "./link.tsx";
import { isSection, sections } from "./sections.ts";

export const TabBar = (props: { nav: Navigation }) => (
  <nav
    aria-label={m.nav_main()}
    class="grid grid-cols-4 border-t border-border bg-background md:hidden"
  >
    <For each={sections}>
      {(section) => (
        <Link
          nav={props.nav}
          href={section.href}
          current={isSection(props.nav.route(), section.page)}
          class={cn(
            "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
            isSection(props.nav.route(), section.page)
              ? "text-foreground"
              : "text-muted-foreground",
          )}
        >
          <Icon icon={section.icon} size={22} />
          {section.label()}
        </Link>
      )}
    </For>
  </nav>
);
