/** The rail on the desktop (56 px): logo, the sections as icon links, the account at the bottom */
import { cn, Icon, IconButton, m } from "@kennwort/ui";
import { Lock, User } from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
import { company } from "../demo.ts";
import type { Navigation } from "../navigation.ts";
import { Link } from "./link.tsx";
import { isSection, sections } from "./sections.ts";

/** `bell`: the notifications (K-602), where the app has an account open */
export const Rail = (props: {
  nav: Navigation;
  onLock: () => void;
  bell?: (() => JSX.Element) | undefined;
}) => (
  <nav
    aria-label={m.nav_main()}
    class="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-border bg-muted py-3 md:flex"
  >
    <span class="mb-2 grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
      <Icon icon={Lock} label={m.app_name()} />
    </span>
    <For each={sections}>
      {(section) => (
        <Link
          nav={props.nav}
          href={section.href}
          label={section.label()}
          current={isSection(props.nav.route(), section.page)}
          class={cn(
            "grid size-9 place-items-center rounded-lg transition-colors",
            isSection(props.nav.route(), section.page)
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          <Icon icon={section.icon} size={18} />
        </Link>
      )}
    </For>
    {props.bell?.()}
    <IconButton label={m.lock()} class="mt-auto" onClick={() => props.onLock()}>
      <Icon icon={Lock} size={18} />
    </IconButton>
    <span
      class="grid size-8 place-items-center rounded-full bg-accent text-foreground"
      role="img"
      aria-label={m.nav_account({ name: company.user })}
    >
      <Icon icon={User} />
    </span>
  </nav>
);
