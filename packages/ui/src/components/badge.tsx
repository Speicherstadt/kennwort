/**
 * Badges in the shadcn style (DESIGN.md): one shared `badgeVariants` for every chip, tag, role and
 * status. default, secondary, outline and destructive as in shadcn; warning ("ändern") and success
 * ("geprüft") carry meaning in our own colours
 */
import type { JSX } from "@solidjs/web";
import { cn } from "../lib/cn.ts";
import { variants } from "../lib/variants.ts";

export const badgeVariants = variants(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap transition-colors [&_svg]:size-3",
  {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-accent text-foreground",
      outline: "border-border text-foreground",
      destructive: "border-transparent bg-danger text-white",
      warning: "border-transparent bg-warning-surface text-warning",
      success: "border-border text-success",
    },
  },
  { variant: "secondary" },
);

export type BadgeVariant = NonNullable<NonNullable<Parameters<typeof badgeVariants>[0]>["variant"]>;

/** The older names of the tones, kept so a status reads the same everywhere */
const toneVariant = {
  neutral: "secondary",
  warning: "warning",
  success: "success",
  danger: "destructive",
} as const satisfies Record<string, BadgeVariant>;

export type BadgeProps = {
  variant?: BadgeVariant | undefined;
  tone?: keyof typeof toneVariant | undefined;
  class?: string;
  children: JSX.Element;
};

export const Badge = (props: BadgeProps) => (
  <span
    class={cn(
      badgeVariants({ variant: props.variant ?? toneVariant[props.tone ?? "neutral"] }),
      props.class,
    )}
  >
    {props.children}
  </span>
);
