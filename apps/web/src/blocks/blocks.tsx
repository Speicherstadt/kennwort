/** Small blocks the pages under the settings share: alerts, empty states, choice cards (DESIGN.md) */
import { Icon } from "@kennwort/ui";
import type { IconNode } from "@kennwort/ui/icons";

export const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

export const EmptyState = (props: { icon: IconNode; text: string }) => (
  <p class="grid place-items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
    <Icon icon={props.icon} size={20} />
    {props.text}
  </p>
);

/** A radio or checkbox as a selectable card, marked while checked */
export const choiceCardClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-accent";
