/**
 * A TOTP field in the detail (K-306 part 4): the current code in Geist Mono, in two groups, and
 * how many seconds it still holds, worked out on the device at every whole second; copying takes
 * the code, never the key (DESIGN.md: Einmalcode 18 px, 22 px on a phone)
 */
import { totpCode } from "@kennwort/core";
import { Icon, IconButton, m, type Toasts } from "@kennwort/ui";
import { Copy } from "@kennwort/ui/icons";
import { createSignal, onCleanup, Show } from "solid-js";
import { copyText } from "./secret-field.tsx";

/** "287082" as "287 082", "94287082" as "9428 7082" */
const grouped = (code: string) => {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
};

export const TotpField = (props: {
  label: string;
  value: string;
  toasts: Toasts;
  now?: () => number;
}) => {
  const now = () => (props.now ?? Date.now)();
  const [time, setTime] = createSignal(now());
  // Each tick at the start of the next whole second, so a new code shows the moment its step
  // begins, not up to a second later (review of K-306 part 4a)
  let timer: ReturnType<typeof setTimeout>;
  const tick = () => {
    setTime(now());
    timer = setTimeout(tick, 1000 - (now() % 1000));
  };
  timer = setTimeout(tick, 1000 - (now() % 1000));
  onCleanup(() => clearTimeout(timer));
  const current = () => totpCode(props.value, time());
  return (
    <div class="flex items-center gap-2 px-3.5 py-2.5">
      <div class="grid min-w-0 flex-1 gap-0.5">
        <span class="text-xs text-muted-foreground">{props.label}</span>
        <Show
          when={current()}
          keyed
          fallback={<span class="text-[13px] text-danger">{m.totp_invalid()}</span>}
        >
          {(result) =>
            result.ok ? (
              <span class="flex items-baseline gap-2">
                <span class="font-mono text-[22px] md:text-lg">{grouped(result.value.code)}</span>
                <span class="text-xs text-muted-foreground">
                  {m.totp_remaining({ seconds: result.value.remaining })}
                </span>
              </span>
            ) : (
              <span class="text-[13px] text-danger">{m.totp_invalid()}</span>
            )
          }
        </Show>
      </div>
      <Show when={current().ok}>
        <IconButton
          label={m.field_copy({ field: props.label })}
          onClick={() => {
            // The code at the click, not at the last tick
            const result = totpCode(props.value, now());
            if (result.ok) void copyText(result.value.code, props.label, props.toasts);
          }}
        >
          <Icon icon={Copy} />
        </IconButton>
      </Show>
    </div>
  );
};
