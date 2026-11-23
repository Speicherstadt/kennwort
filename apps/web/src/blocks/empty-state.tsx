/** An empty list in a dashed frame instead of a loose sentence (DESIGN.md, Aufbau) */
import { Icon } from "@kennwort/ui";
import type { IconNode } from "@kennwort/ui/icons";

export const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

export const EmptyState = (props: { icon: IconNode; text: string }) => (
  <p class="grid place-items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
    <Icon icon={props.icon} size={20} />
    {props.text}
  </p>
);
