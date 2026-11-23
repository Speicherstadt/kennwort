/**
 * The grants on the emergency access page (K-307 part d, P-14): those this account gave, with the
 * request running for each and the grantor's answers to it, and those it holds, with the request,
 * the waiting time and, once the packages are out and checked, the grantor's entries read-only
 */
import type { Given, Received } from "@kennwort/client/emergency/emergency.ts";
import type { OpenedVault } from "@kennwort/client/emergency/open.ts";
import type { ListedGrant } from "@kennwort/core";
import { Badge, Button, m, panelTitleClass, type Toasts } from "@kennwort/ui";
import { LifeBuoy, ShieldUser } from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { For, Match, Show, Switch } from "solid-js";
import { EmptyState } from "../blocks/empty-state.tsx";
import { Field } from "../frame/secret-field.tsx";
import { dateText } from "../vaults/day.ts";
import { DAY_SECONDS, type Phase, phaseOf } from "./emergency.ts";

const terms = (listed: ListedGrant) =>
  `${listed.grant.scope === "full" ? m.emergency_scope_full_short() : m.emergency_scope_view_short()} · ${m.emergency_days({ count: listed.grant.waitSeconds / DAY_SECONDS })}`;

const PhaseText = (props: { listed: ListedGrant; phase: Phase }) => (
  <Switch>
    <Match when={props.phase === "idle"}>
      <Badge variant="outline">{m.emergency_status_idle()}</Badge>
    </Match>
    <Match when={props.phase === "waiting"}>
      <Badge variant="warning">
        {m.emergency_status_waiting({ date: dateText(props.listed.releaseAt ?? 0) })}
      </Badge>
    </Match>
    <Match when={props.phase === "objected"}>
      <Badge variant="secondary">{m.emergency_status_objected()}</Badge>
    </Match>
    <Match when={props.phase === "released"}>
      <Badge variant="success">{m.emergency_status_released()}</Badge>
    </Match>
  </Switch>
);

const Row = (props: { name: string; listed: ListedGrant; now: number; children: JSX.Element }) => (
  <li class="grid gap-3 px-4 py-3">
    <div class="flex flex-wrap items-center gap-3">
      <span
        aria-hidden="true"
        class="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold"
      >
        {props.name.slice(0, 1).toUpperCase()}
      </span>
      <span class="grid min-w-0 flex-1 gap-0.5">
        <span class="truncate text-[13px] font-medium">{props.name}</span>
        <span class="text-xs text-muted-foreground">{terms(props.listed)}</span>
      </span>
      <PhaseText listed={props.listed} phase={phaseOf(props.listed, props.now)} />
    </div>
    <div class="flex flex-wrap gap-2 empty:hidden">{props.children}</div>
  </li>
);

export const GivenList = (props: {
  given: readonly Given[];
  now: number;
  busy: boolean;
  onObject: (given: Given) => void;
  onApprove: (given: Given) => void;
  onRevoke: (given: Given) => void;
}) => (
  <section class="grid gap-3" aria-labelledby="emergency-given-title">
    <h2 id="emergency-given-title" class={panelTitleClass}>
      {m.emergency_given_title()}
    </h2>
    <Show
      when={props.given.length > 0}
      fallback={<EmptyState icon={ShieldUser} text={m.emergency_none_given()} />}
    >
      <ul
        class="divide-y divide-border overflow-hidden rounded-xl border border-border"
        aria-label={m.emergency_given_title()}
      >
        <For each={props.given}>
          {(given) => {
            const name = () => given.grantee?.name ?? m.vault_members_unnamed();
            return (
              <Row name={name()} listed={given} now={props.now}>
                <Show when={phaseOf(given, props.now) === "waiting"}>
                  <Button disabled={props.busy} onClick={() => props.onObject(given)}>
                    {m.emergency_object()}
                  </Button>
                  <Button disabled={props.busy} onClick={() => props.onApprove(given)}>
                    {m.emergency_approve()}
                  </Button>
                </Show>
                <Button disabled={props.busy} onClick={() => props.onRevoke(given)}>
                  {m.emergency_revoke({ name: name() })}
                </Button>
              </Row>
            );
          }}
        </For>
      </ul>
    </Show>
  </section>
);

const OpenedVaults = (props: { vaults: readonly OpenedVault[]; toasts: Toasts }) => (
  <div class="grid w-full gap-3">
    <For each={props.vaults}>
      {(vault) => (
        <section class="grid gap-1" aria-label={vault.name ?? m.vaults_unnamed()}>
          <h3 class="text-xs font-semibold">{vault.name ?? m.vaults_unnamed()}</h3>
          <Show when={vault.error}>
            <p role="alert" class="text-xs text-danger">
              {m.emergency_vault_refused()}
            </p>
          </Show>
          <ul class="divide-y divide-border rounded-xl border border-border">
            <For each={vault.entries}>
              {(entry) => (
                <li aria-label={entry.content.title}>
                  <p class="px-3.5 pt-2.5 font-medium">{entry.content.title}</p>
                  <For each={entry.content.fields.filter((f) => f.value !== "")}>
                    {(field) => (
                      <Field
                        label={field.name}
                        value={field.value}
                        secret={field.kind === "secret"}
                        toasts={props.toasts}
                      />
                    )}
                  </For>
                </li>
              )}
            </For>
          </ul>
        </section>
      )}
    </For>
  </div>
);

export const ReceivedList = (props: {
  received: readonly Received[];
  now: number;
  busy: boolean;
  opened: (grantorKey: string) => readonly OpenedVault[] | undefined;
  keyOf: (received: Received) => string;
  toasts: Toasts;
  onRequest: (received: Received) => void;
  onOpen: (received: Received) => void;
}) => (
  <section class="grid gap-3" aria-labelledby="emergency-received-title">
    <h2 id="emergency-received-title" class={panelTitleClass}>
      {m.emergency_received_title()}
    </h2>
    <Show
      when={props.received.length > 0}
      fallback={<EmptyState icon={LifeBuoy} text={m.emergency_none_received()} />}
    >
      <ul
        class="divide-y divide-border overflow-hidden rounded-xl border border-border"
        aria-label={m.emergency_received_title()}
      >
        <For each={props.received}>
          {(received) => {
            const name = () => received.person?.name ?? m.vault_members_unnamed();
            const phase = () => phaseOf(received, props.now);
            return (
              <Row name={name()} listed={received} now={props.now}>
                <Show when={phase() === "idle" || phase() === "objected"}>
                  <Button disabled={props.busy} onClick={() => props.onRequest(received)}>
                    {m.emergency_request()}
                  </Button>
                </Show>
                <Show when={phase() === "released"}>
                  <Button disabled={props.busy} onClick={() => props.onOpen(received)}>
                    {m.emergency_open()}
                  </Button>
                </Show>
                <Show when={props.opened(props.keyOf(received))}>
                  {(vaults) => <OpenedVaults vaults={vaults()} toasts={props.toasts} />}
                </Show>
              </Row>
            );
          }}
        </For>
      </ul>
    </Show>
  </section>
);
