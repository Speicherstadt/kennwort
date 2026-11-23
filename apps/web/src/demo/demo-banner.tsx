/**
 * The demo's mark (K-706, docs/plan.md: a clear note not to enter real passwords): always above the
 * app, with the passphrase that unlocks it, so nobody takes the page for a real Kennwort.
 */
import { Badge, m } from "@kennwort/ui";
import { DEMO_PASSPHRASE } from "./seed.ts";

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
