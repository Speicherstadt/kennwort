/**
 * The notice that the app reads from the device's offline copy (K-308 part b): offline, only
 * reading, and when the device last had the vault list from the server. It stays while the server
 * does not answer; changes wait until it does. Centred at the bottom on the desktop, above the tab
 * bar on a phone.
 */
import { getLocale, Icon, m } from "@kennwort/ui";
import { CloudOff } from "@kennwort/ui/icons";
import { Show } from "solid-js";

const when = (time: number) =>
  new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }).format(time);

export const OfflineNotice = (props: { offline: boolean; syncedAt: number | undefined }) => (
  <div role="status" aria-live="polite">
    <Show when={props.offline}>
      <div class="fixed right-4 bottom-20 left-4 z-50 flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-[13px] shadow-lg md:right-auto md:bottom-4 md:left-1/2 md:w-96 md:-translate-x-1/2">
        <span class="text-warning">
          <Icon icon={CloudOff} size={18} />
        </span>
        <p class="flex-1 text-foreground">
          <strong class="font-medium">{m.offline_title()}</strong>{" "}
          <span class="text-muted-foreground">
            {props.syncedAt === undefined
              ? m.offline_never()
              : m.offline_synced({ time: when(props.syncedAt) })}
          </span>
        </p>
      </div>
    </Show>
  </div>
);
