/**
 * The demo's mark (K-706, docs/plan.md: a clear note not to enter real passwords): always above the
 * app, with the passphrase that unlocks it, so nobody takes the page for a real Kennwort. One
 * compact line; the note itself opens under „Details“ (a native <details>, no script).
 */
import { Badge, m } from "@kennwort/ui";
import { Show } from "solid-js";
import { DEMO_PASSPHRASE } from "./seed.ts";

/** Said when the app asked the stand-in for something only a real server does (an invitation) */
export const DemoUnavailable = (props: { shown: boolean; onClose: () => void }) => (
  <Show when={props.shown}>
    <div
      role="alert"
      data-testid="demo-unavailable"
      class="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-warning/30 bg-warning-surface px-4 py-3 text-sm text-foreground shadow-lg"
    >
      <span class="flex-1">{m.demo_unavailable()}</span>
      <button type="button" class="font-medium underline" onClick={() => props.onClose()}>
        {m.demo_unavailable_close()}
      </button>
    </div>
  </Show>
);

export const DemoBanner = () => (
  <aside
    data-testid="demo-banner"
    class="shrink-0 border-b border-warning/30 bg-warning-surface px-4 py-1.5 text-[13px] text-foreground"
  >
    <details class="group">
      <summary class="flex min-h-8 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <Badge>{m.demo_badge()}</Badge>
        <span class="min-w-0 truncate">
          {m.demo_passphrase()} <code class="font-mono font-medium">{DEMO_PASSPHRASE}</code>
        </span>
        <span class="ml-auto shrink-0 underline underline-offset-2">{m.demo_details()}</span>
      </summary>
      <p class="pt-1 pb-1">{m.demo_notice()}</p>
    </details>
  </aside>
);
