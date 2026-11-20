/**
 * The popup's frame (DESIGN.md, Extension-Popup, 360 × 600): logo and name, the lock button while
 * the account is open, the screen, and the toasts. Every key press or click inside counts as use
 * and pushes the automatic lock back.
 */
import { Icon, IconButton, m, Toaster, type Toasts } from "@kennwort/ui";
import { Lock } from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { onSettled, Show } from "solid-js";

export const Shell = (props: {
  toasts: Toasts;
  onLock?: (() => void) | undefined;
  onUse?: () => void;
  children: JSX.Element;
}) => {
  // On the whole popup while it is open, and gone with it
  onSettled(() => {
    const use = () => props.onUse?.();
    document.addEventListener("pointerdown", use);
    document.addEventListener("keydown", use);
    return () => {
      document.removeEventListener("pointerdown", use);
      document.removeEventListener("keydown", use);
    };
  });
  return (
    <div class="flex h-[600px] w-[360px] flex-col overflow-hidden bg-background text-foreground">
      <header class="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span class="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Icon icon={Lock} size={14} />
        </span>
        <span class="flex-1 text-[13px] font-semibold">{m.app_name()}</span>
        <Show when={props.onLock}>
          {(lock) => (
            <IconButton label={m.lock()} onClick={() => lock()()}>
              <Icon icon={Lock} />
            </IconButton>
          )}
        </Show>
      </header>
      {props.children}
      <Toaster toasts={props.toasts} />
    </div>
  );
};

/** An error of a form, read out at once */
export const ErrorNote = (props: { text: string | undefined }) => (
  <Show when={props.text}>
    <p role="alert" class="rounded-lg border border-danger px-3 py-2 text-xs text-danger">
      {props.text}
    </p>
  </Show>
);
