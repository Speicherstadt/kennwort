/**
 * Naming a trusted colleague for emergency access (K-307 part d, P-14): a certified colleague, view
 * access to chosen vaults or full access to the account, and a waiting time of one to 30 days
 */
import type { Terms } from "@kennwort/client/emergency/emergency.ts";
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { encodeBytes, type MemberView } from "@kennwort/core";
import { Button, m, selectClass } from "@kennwort/ui";
import { createSignal, For, Show } from "solid-js";
import { DAY_SECONDS, DEFAULT_WAIT_DAYS, WAIT_DAYS } from "./emergency.ts";

export type GiveChoice = { granteeId: Uint8Array; terms: Terms };

export const GiveForm = (props: {
  people: readonly MemberView[];
  vaults: readonly Vault[];
  busy: boolean;
  onGive: (choice: GiveChoice) => void;
}) => {
  const [person, setPerson] = createSignal("");
  const [scope, setScope] = createSignal<"view" | "full">("view");
  const [chosen, setChosen] = createSignal<string[]>([]);
  const [days, setDays] = createSignal<number>(DEFAULT_WAIT_DAYS);
  const toggle = (idText: string, on: boolean) =>
    setChosen((now) => (on ? [...now, idText] : now.filter((id) => id !== idText)));
  const ready = () => person() !== "" && (scope() === "full" || chosen().length > 0);
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const grantee = props.people.find((p) => encodeBytes(p.accountId) === person());
    if (!grantee || !ready()) return;
    const waitSeconds = days() * DAY_SECONDS;
    const vaults = props.vaults.filter((v) => chosen().includes(v.idText));
    const terms: Terms =
      scope() === "full" ? { scope: "full", waitSeconds } : { scope: "view", vaults, waitSeconds };
    props.onGive({ granteeId: grantee.accountId, terms });
  };
  return (
    <form class="grid max-w-md gap-3" onSubmit={submit} aria-labelledby="emergency-give-title">
      <h2 id="emergency-give-title" class="font-semibold">
        {m.emergency_give_title()}
      </h2>
      <label class="grid gap-1.5 text-xs font-medium">
        {m.emergency_person()}
        <select
          class={selectClass}
          value={person()}
          onChange={(event) => setPerson(event.currentTarget.value)}
        >
          <option value="">{m.emergency_choose()}</option>
          <For each={props.people}>
            {(p) => (
              <option value={encodeBytes(p.accountId)}>
                {p.name ?? m.vault_members_unnamed()}
              </option>
            )}
          </For>
        </select>
      </label>
      <fieldset class="grid gap-2">
        <legend class="mb-1 text-xs font-medium">{m.emergency_scope()}</legend>
        <For each={["view", "full"] as const}>
          {(value) => (
            <label class="flex min-h-11 items-center gap-2 md:min-h-0">
              <input
                type="radio"
                name="emergency-scope"
                value={value}
                checked={scope() === value}
                onChange={() => setScope(value)}
              />
              {value === "view" ? m.emergency_scope_view() : m.emergency_scope_full()}
            </label>
          )}
        </For>
      </fieldset>
      <Show when={scope() === "view"}>
        <fieldset class="grid gap-2">
          <legend class="mb-1 text-xs font-medium">{m.emergency_vaults()}</legend>
          <For each={props.vaults}>
            {(vault) => (
              <label class="flex min-h-11 items-center gap-2 md:min-h-0">
                <input
                  type="checkbox"
                  checked={chosen().includes(vault.idText)}
                  onChange={(event) => toggle(vault.idText, event.currentTarget.checked)}
                />
                {vault.name ?? m.vaults_unnamed()}
              </label>
            )}
          </For>
        </fieldset>
      </Show>
      <label class="grid gap-1.5 text-xs font-medium">
        {m.emergency_wait()}
        <select
          class={selectClass}
          value={String(days())}
          onChange={(event) => setDays(Number(event.currentTarget.value))}
        >
          <For each={WAIT_DAYS}>
            {(count) => <option value={String(count)}>{m.emergency_days({ count })}</option>}
          </For>
        </select>
      </label>
      <p class="text-xs text-muted-foreground">
        {scope() === "full" ? m.emergency_full_hint() : m.emergency_view_hint()}
      </p>
      <Button type="submit" class="w-fit" disabled={props.busy || !ready()}>
        {m.emergency_give()}
      </Button>
    </form>
  );
};
