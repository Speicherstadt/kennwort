/**
 * Subcomponents for VaultAddBar (K-608): role picker popover, inline candidate listbox, expiry
 * toggle row, and selected-person chips.
 */
import type { Certificate, VaultRole } from "@kennwort/core";
import { anchoredBelow, anchorName, cn, Icon, m } from "@kennwort/ui";
import { Check, ChevronDown, Clock, X } from "@kennwort/ui/icons";
import { createUniqueId, For, Show } from "solid-js";
import { today } from "./day.ts";
import { type AddCandidate, firstNameOf, initialsOf } from "./vault-access.ts";
import { roleIcon, roleShort } from "./vault-aside.tsx";
import { roleText } from "./vault-text.ts";

const ROLES: readonly VaultRole[] = ["read", "edit", "manage"];

const grantRoleLabel = (role: VaultRole) =>
  role === "read" ? m.vault_access_role_read_grant() : roleText(role);

export const addHintText = (pickedCount: number, entryCount: number, role: VaultRole): string => {
  const count = String(entryCount);
  if (pickedCount === 0) {
    return entryCount === 1
      ? m.vault_access_hint_idle_one()
      : m.vault_access_hint_idle_many({ count });
  }
  const roleLabel = grantRoleLabel(role);
  return pickedCount === 1
    ? m.vault_access_hint_selected_one({ role: roleLabel, count })
    : m.vault_access_hint_selected_many({ people: String(pickedCount), role: roleLabel, count });
};

export const RolePickerButton = (props: {
  role: VaultRole;
  busy: boolean;
  onChange: (role: VaultRole) => void;
}) => {
  const id = createUniqueId();
  let pop: HTMLDivElement | undefined;
  return (
    <>
      <button
        type="button"
        popovertarget={id}
        aria-haspopup="menu"
        aria-controls={id}
        disabled={props.busy}
        style={anchorName(id)}
        class="inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 border-l border-border px-2.5 text-[13px] whitespace-nowrap text-foreground"
      >
        <Icon icon={roleIcon(props.role)} size={13} />
        <span>{roleText(props.role)}</span>
        <Icon icon={ChevronDown} size={14} class="text-muted-foreground" />
      </button>
      <div
        id={id}
        ref={(el) => {
          pop = el;
        }}
        popover="auto"
        role="menu"
        aria-label={m.vault_access_role_menu_label()}
        style={anchoredBelow(id)}
        class="w-[272px] rounded-xl border border-border bg-background p-1.5 text-foreground shadow-lg"
      >
        <For each={ROLES}>
          {(role) => {
            const active = () => props.role === role;
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={active() ? "true" : "false"}
                class="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
                onClick={() => {
                  props.onChange(role);
                  pop?.hidePopover();
                }}
              >
                <span aria-hidden="true" class="mt-0.5 w-4 shrink-0">
                  {active() && <Icon icon={Check} size={15} />}
                </span>
                <span class="flex min-w-0 flex-1 flex-col leading-snug">
                  <span class="text-[13px]">{roleText(role)}</span>
                  <span class="text-xs text-muted-foreground">{roleShort(role)}</span>
                </span>
                <span aria-hidden="true" class="mt-0.5 shrink-0 text-muted-foreground">
                  <Icon icon={roleIcon(role)} size={13} />
                </span>
              </button>
            );
          }}
        </For>
      </div>
    </>
  );
};

export const CandidateListbox = (props: {
  id: string;
  candidates: AddCandidate[];
  highlightedKey: string | undefined;
  hasQuery: boolean;
  onPick: (candidate: AddCandidate) => void;
}) => (
  <div
    id={props.id}
    role="listbox"
    class="-mx-1.5 mt-0.5 -mb-1.5 max-h-64 basis-full overflow-auto border-t border-border p-1.5"
  >
    <Show
      when={props.candidates.length > 0}
      fallback={
        <div class="px-2 py-2 text-xs text-muted-foreground">
          {props.hasQuery ? m.vault_access_none_found() : m.vault_access_all_in()}
        </div>
      }
    >
      <For each={props.candidates}>
        {(candidate) => {
          const hl = () => !candidate.unconfirmed && props.highlightedKey === candidate.key;
          return (
            <button
              type="button"
              role="option"
              aria-selected={hl() ? "true" : "false"}
              disabled={candidate.unconfirmed}
              class={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                candidate.unconfirmed
                  ? "cursor-not-allowed opacity-55"
                  : "cursor-pointer hover:bg-accent",
                hl() && "bg-accent",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => props.onPick(candidate)}
            >
              <span
                aria-hidden="true"
                class="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold"
              >
                {initialsOf(candidate.name)}
              </span>
              <span class="flex min-w-0 flex-1 flex-col leading-snug">
                <span class="truncate text-[13px]">{candidate.name}</span>
                <Show when={candidate.unconfirmed}>
                  <span class="text-xs text-muted-foreground">
                    {m.vault_access_unconfirmed_hint()}
                  </span>
                </Show>
              </span>
            </button>
          );
        }}
      </For>
    </Show>
  </div>
);

export const ExpiryRow = (props: {
  hint: string;
  untilOn: boolean;
  until: string;
  onEnable: () => void;
  onDisable: () => void;
  onChange: (value: string) => void;
}) => (
  <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
    <span>{props.hint}</span>
    <Show
      when={props.untilOn}
      fallback={
        <button
          type="button"
          class="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"
          onClick={() => props.onEnable()}
        >
          <Icon icon={Clock} size={13} />
          <span class="underline underline-offset-2">{m.vault_access_limit_button()}</span>
        </button>
      }
    >
      <span class="inline-flex items-center gap-1.5">
        <span>{m.vault_access_limit_prefix()}</span>
        <input
          type="date"
          min={today()}
          value={props.until}
          aria-label={m.vault_access_limit_date_label()}
          class="h-6.5 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
          onInput={(event) => props.onChange(event.currentTarget.value)}
        />
        <button
          type="button"
          aria-label={m.vault_access_limit_clear()}
          class="grid size-5 cursor-pointer place-items-center rounded hover:bg-accent hover:text-foreground"
          onClick={() => props.onDisable()}
        >
          <Icon icon={X} size={12} />
        </button>
      </span>
    </Show>
  </div>
);

export const PickedChips = (props: {
  picked: (AddCandidate & { certificate: Certificate })[];
  onUnpick: (key: string) => void;
}) => (
  <For each={props.picked}>
    {(person) => (
      <span class="inline-flex items-center gap-1.5 rounded-full bg-accent py-0.5 pr-1 pl-0.5 text-[12.5px] font-medium">
        <span
          aria-hidden="true"
          class="grid size-[22px] place-items-center rounded-full bg-background text-[9px] font-semibold"
        >
          {initialsOf(person.name)}
        </span>
        <span>{firstNameOf(person.name)}</span>
        <button
          type="button"
          aria-label={m.vault_access_unpick({ name: person.name })}
          class="grid size-[18px] cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-border hover:text-foreground"
          onClick={() => props.onUnpick(person.key)}
        >
          <Icon icon={X} size={11} />
        </button>
      </span>
    )}
  </For>
);
