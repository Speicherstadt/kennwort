/**
 * „Mitteilungen“ (K-602, P-24): the account's notifications, newest first, each with what happened
 * in the names this device knows and a link to where the person checks it; read one or all, delete
 * one. Below, push on this device and which kinds go out as push.
 */
import type { Notification } from "@kennwort/core";
import { Button, cn, Icon, IconButton, introClass, m, pageClass } from "@kennwort/ui";
import { BellOff, Trash2 } from "@kennwort/ui/icons";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Loading, onSettled, Show } from "solid-js";
import { isPlainClick, type Navigation } from "../navigation.ts";
import { queryKeys } from "../queries.ts";
import { type Names, notificationText } from "./notification-text.ts";
import { type NotificationsDeps, notificationsQuery, tokenOf } from "./notifications-query.ts";
import { PushSettings } from "./push-settings.tsx";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const timeText = (time: number) =>
  new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(time);

type RowProps = {
  note: Notification;
  names: Names;
  nav: Navigation;
  busy: boolean;
  onRead: () => void;
  onDelete: () => void;
};

const NotificationRow = (props: RowProps) => {
  const shown = () => notificationText(props.note, props.names);
  return (
    <li class="flex items-start gap-3 px-3.5 py-2.5">
      <span
        class={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          props.note.read ? "bg-transparent" : "bg-primary",
        )}
        role="img"
        aria-label={props.note.read ? undefined : m.notifications_unread()}
        aria-hidden={props.note.read ? "true" : undefined}
      />
      <div class="grid min-w-0 flex-1 gap-0.5">
        <a
          href={shown().href}
          class={cn("text-[13px] hover:underline", !props.note.read && "font-medium")}
          onClick={(event) => {
            if (!props.note.read) props.onRead();
            if (!isPlainClick(event)) return;
            event.preventDefault();
            props.nav.go(shown().href);
          }}
        >
          {shown().text}
        </a>
        <span class="text-xs text-muted-foreground">{timeText(props.note.createdAt)}</span>
      </div>
      <Show when={!props.note.read}>
        <Button size="sm" class="h-11 md:h-7" disabled={props.busy} onClick={() => props.onRead()}>
          {m.notifications_mark_read()}
        </Button>
      </Show>
      <IconButton
        label={m.notifications_delete()}
        class="size-11 md:size-8"
        disabled={props.busy}
        onClick={() => props.onDelete()}
      >
        <Icon icon={Trash2} size={16} />
      </IconButton>
    </li>
  );
};

export const NotificationsPage = (props: {
  nav: Navigation;
  deps: NotificationsDeps;
  names: Names;
  /** The people and vaults anew when the page opens, so a newcomer has a name (the vaults' load) */
  onOpen?: () => void;
}) => {
  const client = useQueryClient();
  const list = useQuery(notificationsQuery(props.deps));
  onSettled(() => props.onOpen?.());
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  /** One change at a time, then the list anew from the server */
  const change = async (run: (token: string) => Promise<boolean>) => {
    setBusy(true);
    const done = await run(tokenOf(props.deps.session));
    setFailed(!done);
    await client.invalidateQueries({ queryKey: queryKeys.notifications });
    setBusy(false);
  };
  const api = props.deps.api;
  return (
    <section aria-labelledby="page-title" class={pageClass("wide")}>
      <div class="mb-1 flex flex-wrap items-center gap-2">
        <h1 id="page-title" class="flex-1 text-[28px] font-semibold md:text-lg">
          {m.notifications_title()}
        </h1>
        <Loading fallback={null}>
          <Show when={(list.data?.unread ?? 0) > 0}>
            <Button
              class="h-11 md:h-8"
              disabled={busy()}
              onClick={() => void change((token) => api.markAllRead(token))}
            >
              {m.notifications_read_all()}
            </Button>
          </Show>
        </Loading>
      </div>
      <p class={introClass}>{m.notifications_hint()}</p>
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div class="grid content-start gap-4">
          <Show when={failed()}>
            <p role="alert" class={alertClass}>
              {m.notifications_load_failed()}
            </p>
          </Show>
          <Loading>
            <Show
              when={list.data}
              fallback={
                <p role="alert" class={alertClass}>
                  {m.notifications_load_failed()}
                </p>
              }
            >
              {(loaded) => (
                <Show
                  when={loaded().notifications.length > 0}
                  fallback={
                    <p class="grid place-items-center gap-2 rounded-xl border border-dashed border-border px-4 py-12 text-center text-[13px] text-muted-foreground">
                      <Icon icon={BellOff} size={20} />
                      {m.notifications_empty()}
                    </p>
                  }
                >
                  <ul
                    aria-label={m.notifications_list()}
                    class="divide-y divide-border rounded-xl border border-border"
                  >
                    <For each={loaded().notifications}>
                      {(note) => (
                        <NotificationRow
                          note={note}
                          names={props.names}
                          nav={props.nav}
                          busy={busy()}
                          onRead={() => void change((token) => api.markRead(token, note.id))}
                          onDelete={() =>
                            void change((token) => api.removeNotification(token, note.id))
                          }
                        />
                      )}
                    </For>
                  </ul>
                </Show>
              )}
            </Show>
          </Loading>
        </div>
        <PushSettings deps={props.deps} />
      </div>
    </section>
  );
};
