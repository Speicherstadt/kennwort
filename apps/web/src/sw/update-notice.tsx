/**
 * The notice that a verified new version waits (P-16): it stays until the user reloads, as the new
 * version takes over only at the next navigation, never under a running page. Above the tab bar on a
 * phone, in the corner of the toasts on the desktop.
 */
import { Button, m } from "@kennwort/ui";
import { Show } from "solid-js";

export const UpdateNotice = (props: { ready: boolean; onReload: () => void }) => (
  <div role="status" aria-live="polite">
    <Show when={props.ready}>
      <div class="fixed right-4 bottom-20 left-4 z-50 flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-[13px] shadow-lg md:bottom-4 md:left-auto md:w-80">
        <p class="flex-1 text-foreground">{m.update_ready()}</p>
        <Button variant="primary" size="sm" onClick={() => props.onReload()}>
          {m.update_reload()}
        </Button>
      </div>
    </Show>
  </div>
);
