/**
 * A menu button (WAI-ARIA APG): opens on click, Enter or Space with the first item focused; arrows,
 * Home and End move, Enter chooses, Esc and Tab close and give the focus back to the button.
 */

import type { JSX } from "@solidjs/web";
import type { IconNode } from "lucide";
import { createSignal, createUniqueId, For } from "solid-js";
import { ariaBoolean } from "../lib/aria.ts";
import { cn } from "../lib/cn.ts";
import { nextIndex } from "../lib/keys.ts";
import { anchoredBelow, anchorName } from "./anchor.ts";
import { buttonClass } from "./button.tsx";
import { Icon } from "./icon.tsx";
import { floatingClass } from "./popover.tsx";

export type MenuItem = {
  label: string;
  icon?: IconNode;
  danger?: boolean;
  /** Shown but not chosen: this account may not use it here */
  disabled?: boolean;
  onSelect: () => void;
};
export type MenuProps = {
  trigger: JSX.Element;
  label?: string;
  items: MenuItem[];
  /** The trigger's look, an outline button unless given */
  triggerClass?: string;
};

export const Menu = (props: MenuProps) => {
  const id = createUniqueId();
  const [open, setOpen] = createSignal(false);
  let menu: HTMLDivElement | undefined;
  let button: HTMLButtonElement | undefined;
  const items = () => [
    ...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []),
  ];
  const close = () => {
    menu?.hidePopover();
    button?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab") return close();
    const list = items();
    const next = nextIndex(
      event.key,
      list.indexOf(document.activeElement as HTMLElement),
      list.length,
    );
    if (next === undefined) return;
    event.preventDefault();
    list[next]?.focus();
  };
  return (
    <>
      <button
        ref={(el) => {
          button = el;
        }}
        type="button"
        popovertarget={id}
        aria-haspopup="menu"
        aria-expanded={ariaBoolean(open())}
        aria-controls={id}
        aria-label={props.label}
        class={props.triggerClass ?? buttonClass()}
        style={anchorName(id)}
      >
        {props.trigger}
      </button>
      <div
        id={id}
        ref={(el) => {
          menu = el;
        }}
        popover="auto"
        role="menu"
        aria-label={props.label}
        class={cn(floatingClass, "min-w-44")}
        style={anchoredBelow(id)}
        onToggle={(event) => {
          const isOpen = (event as ToggleEvent).newState === "open";
          setOpen(isOpen);
          if (isOpen) items()[0]?.focus();
        }}
        onKeyDown={onKeyDown}
      >
        <For each={props.items}>
          {(item) => (
            <button
              type="button"
              role="menuitem"
              tabindex="-1"
              disabled={item.disabled}
              class={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent focus:bg-accent focus:outline-none disabled:pointer-events-none disabled:opacity-50",
                item.danger && "text-danger",
              )}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.icon && <Icon icon={item.icon} />}
              {item.label}
            </button>
          )}
        </For>
      </div>
    </>
  );
};
