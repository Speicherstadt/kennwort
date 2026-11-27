/**
 * The one dialog shell (DESIGN.md, Dialog), in the shadcn style on <dialog> with showModal(): the
 * browser traps the focus and closes on Esc. A blurred overlay, a centred card on the desktop and
 * a bottom sheet on the phone; header with title, description and ×, then body and footer.
 */

import type { JSX } from "@solidjs/web";
import { TriangleAlert, X } from "lucide";
import { createEffect, createUniqueId, Show } from "solid-js";
import { cn } from "../lib/cn.ts";
import { variants } from "../lib/variants.ts";
import { m } from "../paraglide/messages.js";
import { IconButton } from "./button.tsx";
import { Icon } from "./icon.tsx";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string | undefined;
  /** The buttons, secondary before primary; inside a form put a DialogFooter in the children */
  footer?: JSX.Element;
  size?: "sm" | "md" | "lg";
  /** For a question that destroys something: a warning sign beside the title */
  variant?: "default" | "destructive";
  role?: "dialog" | "alertdialog";
  children?: JSX.Element;
};

const candidates = "a[href], button, input, select, textarea, [tabindex]";

/**
 * What Tab can reach: in the tab order, not disabled, rendered (not hidden, not in a closed
 * popover, not display:none) and not inert (review of K-301)
 */
const tabbable = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(candidates)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.hasAttribute("disabled") &&
      !el.closest("[hidden], [inert]") &&
      el.checkVisibility(),
  );

/**
 * Tab and Shift+Tab wrap around inside the dialog (WAI-ARIA APG): showModal() makes the page
 * inert, but Chromium still lets the focus leave to the browser's own controls
 */
const wrapFocus = (event: KeyboardEvent, dialog: HTMLElement) => {
  if (event.key !== "Tab") return;
  const items = tabbable(dialog);
  const first = items[0];
  const last = items.at(-1);
  const edge = event.shiftKey ? first : last;
  if (document.activeElement !== edge) return;
  event.preventDefault();
  (event.shiftKey ? last : first)?.focus();
};

export const dialogClass = variants(
  cn(
    "fixed inset-x-0 bottom-0 mx-0 mt-auto mb-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-xl border border-border bg-background p-0 text-foreground shadow-lg",
    "backdrop:bg-black/50 backdrop:backdrop-blur-sm",
    "md:inset-0 md:m-auto md:w-[calc(100vw-2rem)] md:rounded-lg",
  ),
  { size: { sm: "md:max-w-sm", md: "md:max-w-lg", lg: "md:max-w-2xl" } },
  { size: "md" },
);

/** The row of buttons at the end: stacked with the primary on top on the phone, right on the desktop */
export const DialogFooter = (props: { children?: JSX.Element; class?: string }) => (
  <div
    class={cn(
      "flex flex-col-reverse gap-2 pt-2 md:flex-row md:justify-end [&>button]:h-11 md:[&>button]:h-8",
      props.class,
    )}
  >
    {props.children}
  </div>
);

const Header = (props: DialogProps & { id: string }) => (
  <div class="flex items-start gap-3 p-5 pb-3 md:p-6 md:pb-4">
    <Show when={props.variant === "destructive"}>
      <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
        <Icon icon={TriangleAlert} size={18} />
      </span>
    </Show>
    <div class="grid flex-1 gap-1.5 pt-0.5">
      <h2 id={`${props.id}-title`} class="text-base leading-none font-semibold">
        {props.title}
      </h2>
      <Show when={props.description}>
        <p id={`${props.id}-description`} class="text-[13px] text-muted-foreground">
          {props.description}
        </p>
      </Show>
    </div>
    <IconButton
      label={m.ui_close()}
      class="-mt-1.5 -mr-2 text-muted-foreground"
      onClick={() => props.onClose()}
    >
      <Icon icon={X} />
    </IconButton>
  </div>
);

export const Dialog = (props: DialogProps) => {
  const id = createUniqueId();
  let dialog: HTMLDialogElement | undefined;
  createEffect(
    () => props.open,
    (open) => {
      if (open && !dialog?.open) dialog?.showModal();
      if (!open && dialog?.open) dialog.close();
    },
  );
  return (
    <dialog
      ref={(el) => {
        dialog = el;
      }}
      role={props.role}
      aria-labelledby={`${id}-title`}
      aria-describedby={props.description ? `${id}-description` : undefined}
      data-variant={props.variant ?? "default"}
      onClose={() => props.onClose()}
      onKeyDown={(event) => wrapFocus(event, event.currentTarget)}
      class={dialogClass({ size: props.size })}
    >
      <Header {...props} id={id} />
      <div class="grid gap-3 px-5 pb-5 text-[13px] md:px-6 md:pb-6">
        {props.children}
        <Show when={props.footer}>
          <DialogFooter>{props.footer}</DialogFooter>
        </Show>
      </div>
    </dialog>
  );
};
