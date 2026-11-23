/**
 * The demo's mark (K-706, docs/plan.md: a clear note not to enter real passwords): always above the
 * app, with the passphrase that unlocks it, so nobody takes the page for a real Kennwort.
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
      class="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50"
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
    class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50"
  >
    <Badge>{m.demo_badge()}</Badge>
    <span>{m.demo_notice()}</span>
    <span class="font-medium">
      {m.demo_passphrase()} <code class="font-mono">{DEMO_PASSPHRASE}</code>
    </span>
  </aside>
);
