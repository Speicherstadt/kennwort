/**
 * The rail on the desktop (56 px): the sections as icon links, each with its name as a tooltip on
 * hover and focus; at the bottom „Sperren“ (Strg/Cmd+L) and the account. No logo: a lock up top
 * read as a second lock button.
 */
import { cn, Icon, m, Tooltip } from "@kennwort/ui";
import { Lock, User } from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { For, onSettled } from "solid-js";
import { company } from "../demo.ts";
import type { Navigation } from "../navigation.ts";
import { Link } from "./link.tsx";
import { isSection, sections } from "./sections.ts";

const itemClass = "grid size-9 place-items-center rounded-lg transition-colors";

/** Strg+L or Cmd+L locks from anywhere in the app, as the tooltip says */
export const isLockKey = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key === "l";

/** `bell`: the notifications (K-602), where the app has an account open */
export const Rail = (props: {
  nav: Navigation;
  onLock: () => void;
  bell?: (() => JSX.Element) | undefined;
}) => {
  const onKey = (event: KeyboardEvent) => {
    if (!isLockKey(event)) return;
    event.preventDefault();
    props.onLock();
  };
  onSettled(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  return (
    <nav
      aria-label={m.nav_main()}
      class="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-border bg-muted py-3 md:flex"
    >
      <For each={sections}>
        {(section) => (
          <Tooltip text={section.label()}>
            {(trigger) => (
              <span {...trigger}>
                <Link
                  nav={props.nav}
                  href={section.href}
                  label={section.label()}
                  current={isSection(props.nav.route(), section.page)}
                  class={cn(
                    itemClass,
                    isSection(props.nav.route(), section.page)
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Icon icon={section.icon} size={18} />
                </Link>
              </span>
            )}
          </Tooltip>
        )}
      </For>
      {props.bell?.()}
      <div class="mt-auto grid justify-items-center gap-2 border-t border-border pt-3">
        <Tooltip text={m.lock_shortcut()}>
          {(trigger) => (
            <button
              type="button"
              {...trigger}
              aria-label={m.lock()}
              aria-keyshortcuts="Control+L Meta+L"
              class={cn(itemClass, "border border-border bg-background hover:bg-accent")}
              onClick={() => props.onLock()}
            >
              <Icon icon={Lock} size={18} />
            </button>
          )}
        </Tooltip>
        <Tooltip text={m.nav_account({ name: company.user })}>
          {(trigger) => (
            <span
              {...trigger}
              class="grid size-8 place-items-center rounded-full bg-accent text-foreground"
              role="img"
              aria-label={m.nav_account({ name: company.user })}
            >
              <Icon icon={User} />
            </span>
          )}
        </Tooltip>
      </div>
    </nav>
  );
};
