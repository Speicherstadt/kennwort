/** A field of the entry; a secret shows as dots until revealed, copy and reveal are own buttons (DESIGN.md) */
import { Icon, IconButton, m, type Toasts } from "@kennwort/ui";
import { Copy, Eye, EyeOff } from "@kennwort/ui/icons";
import { createSignal, Show } from "solid-js";

export type FieldProps = {
  label: string;
  value: string;
  secret?: boolean;
  mono?: boolean;
  toasts: Toasts;
};

export const copyText = async (text: string, label: string, toasts: Toasts) => {
  try {
    await navigator.clipboard.writeText(text);
    toasts.show(m.field_copied({ field: label }), "success");
  } catch {
    // No clipboard (insecure context or denied): the value stays on screen to copy by hand
  }
};

export const Field = (props: FieldProps) => {
  const [revealed, setRevealed] = createSignal(false);
  return (
    <div class="flex items-center gap-2 px-3.5 py-2.5">
      <div class="grid min-w-0 flex-1 gap-0.5">
        <span class="text-xs text-muted-foreground">{props.label}</span>
        <span class={props.secret || props.mono ? "truncate font-mono" : "truncate"}>
          {props.secret && !revealed() ? "•".repeat(12) : props.value}
        </span>
      </div>
      <Show when={props.secret}>
        <IconButton
          label={revealed() ? m.field_hide() : m.field_reveal()}
          aria-pressed={revealed() ? "true" : "false"}
          onClick={() => setRevealed(!revealed())}
        >
          <Icon icon={revealed() ? EyeOff : Eye} />
        </IconButton>
      </Show>
      <IconButton
        label={m.field_copy({ field: props.label })}
        onClick={() => copyText(props.value, props.label, props.toasts)}
      >
        <Icon icon={Copy} />
      </IconButton>
    </div>
  );
};
