/**
 * Checkbox and Switch in the shadcn style (DESIGN.md): a real <input type="checkbox"> underneath,
 * so the browser keeps the keyboard, the form value and the role; only the look is drawn on top.
 * The Switch adds role="switch" (WAI-ARIA APG) for settings that take effect at once.
 */
import type { JSX } from "@solidjs/web";
import { Check } from "lucide";
import { omit } from "solid-js";
import { Icon } from "./icon.tsx";

export type CheckboxProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type" | "role">;

const focusRing =
  "outline-none focus-visible:ring-[3px] focus-visible:ring-foreground/25 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

const boxClass = `peer size-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-foreground/30 bg-background shadow-xs transition-colors checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const Checkbox = (props: CheckboxProps) => (
  <span class={["relative inline-flex size-4 shrink-0", props.class]}>
    <input type="checkbox" {...omit(props, "class")} class={boxClass} />
    <Icon
      icon={Check}
      size={14}
      class="pointer-events-none absolute inset-0 m-auto stroke-[3] text-primary-foreground opacity-0 peer-checked:opacity-100"
    />
  </span>
);

const trackClass = `peer h-[18px] w-8 shrink-0 cursor-pointer appearance-none rounded-full bg-foreground/20 transition-colors checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const Switch = (props: CheckboxProps) => (
  <span class={["relative inline-flex h-[18px] w-8 shrink-0", props.class]}>
    {/* biome-ignore lint/a11y/useAriaPropsForRole: a native checkbox carries its own checked state, which role="switch" reports as aria-checked */}
    <input type="checkbox" role="switch" {...omit(props, "class")} class={trackClass} />
    <span
      aria-hidden="true"
      class="pointer-events-none absolute top-[2px] left-[2px] size-3.5 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-3.5"
    />
  </span>
);
