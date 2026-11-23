/**
 * The demo's mark (K-706, docs/plan.md: a clear note not to enter real passwords): always above the
 * app, with the passphrase that unlocks it, so nobody takes the page for a real Kennwort. One
 * compact line; the note itself opens under „Details“ (a native <details>, no script).
 */
import { Badge, m } from "@kennwort/ui";
import { DEMO_PASSPHRASE } from "./seed.ts";

export const DemoBanner = () => (
  <aside
    data-testid="demo-banner"
    class="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-[13px] text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50"
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
