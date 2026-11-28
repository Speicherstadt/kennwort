/** A field of the entry; a secret shows as dots until revealed, copy and reveal are own buttons (DESIGN.md) */
import { cn, copyText, Icon, m, type Toasts, TooltipIconButton } from "@kennwort/ui";
import { Copy, Eye, EyeOff } from "@kennwort/ui/icons";
import { createSignal, Show } from "solid-js";

export type FieldProps = {
  label: string;
  value: string;
  secret?: boolean;
  mono?: boolean;
  /** Long text (a note, an address, a key): shown whole, line breaks kept */
  multiline?: boolean;
  toasts: Toasts;
};

export const Field = (props: FieldProps) => {
  const [revealed, setRevealed] = createSignal(false);
  return (
    <div class="flex min-h-14 items-center gap-2 px-4 py-2 md:gap-1">
      <div class="grid min-w-0 flex-1 gap-0.5">
        <span class="text-xs font-medium text-muted-foreground">{props.label}</span>
        <span
          translate="no"
          class={cn(
            props.multiline ? "break-words whitespace-pre-wrap" : "truncate",
            (props.secret || props.mono) && "font-mono",
          )}
        >
          {props.secret && !revealed() ? "•".repeat(12) : props.value}
        </span>
      </div>
      <Show when={props.secret}>
        <TooltipIconButton
          class="size-11 md:size-8"
          label={
            revealed()
              ? m.field_hide({ field: props.label })
              : m.field_reveal({ field: props.label })
          }
          aria-pressed={revealed() ? "true" : "false"}
          onClick={() => setRevealed(!revealed())}
        >
          <Icon icon={revealed() ? EyeOff : Eye} />
        </TooltipIconButton>
      </Show>
      <TooltipIconButton
        class="size-11 md:size-8"
        label={m.field_copy({ field: props.label })}
        onClick={() => copyText(props.value, props.label, props.toasts)}
      >
        <Icon icon={Copy} />
      </TooltipIconButton>
    </div>
  );
};
