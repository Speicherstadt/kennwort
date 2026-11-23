/**
 * The phone's tab bar: the sections and, with an account open, the notifications (K-602) as a
 * fifth tab; touch targets of at least 44 px (DESIGN.md)
 */
import { cn, Icon, m } from "@kennwort/ui";
import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
import type { Navigation } from "../navigation.ts";
import { Link } from "./link.tsx";
import { isSection, sections } from "./sections.ts";

export const TabBar = (props: { nav: Navigation; bell?: (() => JSX.Element) | undefined }) => (
  <nav
    aria-label={m.nav_main()}
    class="grid border-t border-border bg-background md:hidden"
    style={{
      "grid-template-columns": `repeat(${sections.length + (props.bell ? 1 : 0)}, minmax(0, 1fr))`,
    }}
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
          {(section.short ?? section.label)()}
        </Link>
      )}
    </For>
    {props.bell?.()}
  </nav>
);
