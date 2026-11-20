/**
 * The devices signed in to this account (K-303, P-04): each can be signed out here. Signing out
 * this device also makes it forget the account, so the next start shows the welcome page.
 */
import type { DeviceEntry } from "@kennwort/core";
import { Button, m } from "@kennwort/ui";
import { createEffect, createSignal, For, Show } from "solid-js";
import type { DevicesApi } from "../session/devices-api.ts";

type Load = { state: "loading" } | { state: "failed" } | { state: "ready"; devices: DeviceEntry[] };

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
  const [load, setLoad] = createSignal<Load>({ state: "loading" });
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const refresh = async (token: string) => {
    const devices = await props.api.devices(token);
    setLoad(devices ? { state: "ready", devices } : { state: "failed" });
  };
  // The list belongs to the token it was loaded with: another sign-in loads it anew
  createEffect(
    () => props.token,
    (token) => void refresh(token),
  );
  const remove = async (device: DeviceEntry) => {
    setBusy(true);
    setFailed(false);
    const removed = await props.api.removeDevice(props.token, device.id);
    setBusy(false);
    if (!removed) return setFailed(true);
    if (device.current) return props.onSignedOut();
    await refresh(props.token);
  };
  const ready = () => {
    const value = load();
    return value.state === "ready" ? value.devices : undefined;
  };
  return (
    <section aria-labelledby="devices-title" class="grid gap-2">
      <h2 id="devices-title" class="text-xs font-medium">
        {m.devices_title()}
      </h2>
      <Show when={load().state === "failed"}>
        <p role="alert" class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger">
          {m.devices_load_failed()}
        </p>
      </Show>
      <Show when={ready()}>
        {(devices) => (
          <ul class="divide-y divide-border rounded-xl border border-border">
            <For each={devices()}>
              {(device) => (
                <DeviceRow device={device} busy={busy()} onRemove={() => remove(device)} />
              )}
            </For>
          </ul>
        )}
      </Show>
      <Show when={failed()}>
        <p role="alert" class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger">
          {m.devices_remove_failed()}
        </p>
      </Show>
    </section>
  );
};
