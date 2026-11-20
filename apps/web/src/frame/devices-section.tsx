/**
 * The devices signed in to this account (K-303, P-04): each can be signed out here. Signing out
 * this device also makes it forget the account, so the next start shows the welcome page.
 */
import type { DeviceEntry } from "@kennwort/core";
import { Button, m } from "@kennwort/ui";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createEffect, createSignal, For, Loading, Show } from "solid-js";
import { queryKeys } from "../queries.ts";
import type { DevicesApi } from "../session/devices-api.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const formatTime = (time: number) =>
  new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(time);

const DeviceRow = (props: { device: DeviceEntry; busy: boolean; onRemove: () => void }) => (
  <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
    <div class="min-w-0 flex-1">
      <p class="font-medium">
        {props.device.name ?? m.devices_unnamed()}
        <Show when={props.device.current}>
          <span class="ml-2 text-xs font-normal text-muted-foreground">
            {m.devices_this_device()}
          </span>
        </Show>
      </p>
      <p class="text-xs text-muted-foreground">
        {m.devices_last_seen({ time: formatTime(props.device.lastSeenAt) })}
      </p>
    </div>
    <Button size="sm" class="h-11 md:h-7" disabled={props.busy} onClick={() => props.onRemove()}>
      {props.device.current ? m.devices_sign_out_this() : m.devices_sign_out()}
    </Button>
  </li>
);

export const DevicesSection = (props: {
  token: string;
  api: DevicesApi;
  /** This device was signed out: the app forgets the account */
  onSignedOut: () => void;
}) => {
  const client = useQueryClient();
  // null for a list that did not load: a query holds a value, never undefined
  const devices = useQuery(() => {
    const token = props.token;
    return {
      queryKey: queryKeys.devices,
      queryFn: async () => (await props.api.devices(token)) ?? null,
    };
  });
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const reload = () => client.invalidateQueries({ queryKey: queryKeys.devices });
  // The list belongs to the token it was loaded with: another sign-in loads it anew. The token
  // stays out of the query key, so the list is loaded anew by hand
  createEffect(
    () => props.token,
    () => void reload(),
    { defer: true },
  );
  const remove = async (device: DeviceEntry) => {
    setBusy(true);
    setFailed(false);
    const removed = await props.api.removeDevice(props.token, device.id);
    setBusy(false);
    if (!removed) return setFailed(true);
    if (device.current) return props.onSignedOut();
    await reload();
  };
  return (
    <section aria-labelledby="devices-title" class="grid gap-2">
      <h2 id="devices-title" class="text-xs font-medium">
        {m.devices_title()}
      </h2>
      <Loading>
        <Show
          when={devices.data}
          fallback={
            <p role="alert" class={alertClass}>
              {m.devices_load_failed()}
            </p>
          }
        >
          {(list) => (
            <ul class="divide-y divide-border rounded-xl border border-border">
              <For each={list()}>
                {(device) => (
                  <DeviceRow device={device} busy={busy()} onRemove={() => remove(device)} />
                )}
              </For>
            </ul>
          )}
        </Show>
      </Loading>
      <Show when={failed()}>
        <p role="alert" class={alertClass}>
          {m.devices_remove_failed()}
        </p>
      </Show>
    </section>
  );
};
