/**
 * Selectable chips in the look of shadcn's Toggle/ToggleGroup (DESIGN.md): an outlined h-8 button
 * that turns bg-accent when on. "On" is read from aria-pressed (buttons), aria-current (links that
 * filter by URL) or data-state="on", so the state lives in the attribute screen readers announce.
 */
import { variants } from "../lib/variants.ts";

export const toggleVariants = variants(
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-accent aria-pressed:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground [&_svg]:size-4",
  {
    variant: {
      default: "bg-transparent text-muted-foreground",
      outline: "border border-border bg-transparent text-muted-foreground shadow-xs",
    },
  },
  { variant: "outline" },
);
