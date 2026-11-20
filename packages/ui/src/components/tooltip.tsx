/**
 * A tooltip (WAI-ARIA APG): shown on hover and keyboard focus, hidden on Esc, on leaving and on
 * blur; the trigger points to it with aria-describedby. A manual popover, so it never steals focus.
 */
import type { JSX } from "@solidjs/web";
import { createUniqueId } from "solid-js";
import { anchoredBelow, anchorName } from "./anchor.ts";

export type TriggerAttributes = {
  "aria-describedby": string;
  style: Record<string, string>;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

export type TooltipProps = {
  text: string;
  /** Renders the trigger with the attributes it must carry */
  children: (trigger: TriggerAttributes) => JSX.Element;
};

export const Tooltip = (props: TooltipProps) => {
  const id = createUniqueId();
  let tip: HTMLDivElement | undefined;
  const show = () => tip?.showPopover();
  const hide = () => {
    if (tip?.matches(":popover-open")) tip.hidePopover();
  };
  return (
    <>
      {props.children({
        "aria-describedby": id,
        style: anchorName(id),
        onPointerEnter: show,
        onPointerLeave: hide,
        onFocus: show,
        onBlur: hide,
        onKeyDown: (event) => {
          if (event.key === "Escape") hide();
        },
      })}
      <div
        id={id}
        ref={(el) => {
          tip = el;
        }}
        popover="manual"
        role="tooltip"
        class="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground shadow-md"
        style={anchoredBelow(id)}
      >
        {props.text}
      </div>
    </>
  );
};
