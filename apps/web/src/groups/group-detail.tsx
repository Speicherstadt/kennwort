/**
 * Detail panel for one group on the Groups page: two clean toggle columns side-by-side — Vaults
 * (switch + role select, no dropdown walls) and Members (switch + initials). Toggling a vault or
 * member directly grants verified members on vaults this device manages; turning off a member
 * delegates to LeaveGroupDialog when vault access can be rotated out.
 */

import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { idKey, type MemberView, type VaultRole } from "@kennwort/core";
import { Button, cn, Icon, m } from "@kennwort/ui";
import { Lock } from "@kennwort/ui/icons";
import { For, Show } from "solid-js";
import { RoleSelect } from "../vaults/role-select.tsx";
import { mayManage } from "../vaults/vault-members.ts";
import { roleText } from "../vaults/vault-text.ts";
import type { VaultLink } from "./group-access.ts";
import type { Group } from "./groups.ts";

const vaultName = (vault: Vault) => vault.name ?? m.vaults_unnamed();

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

const Toggle = (props: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={props.checked ? "true" : "false"}
    aria-label={props.label}
    disabled={props.disabled}
    onClick={() => props.onChange(!props.checked)}
    class={cn(
      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50",
      props.checked ? "bg-foreground" : "bg-muted-foreground/30",
    )}
  >
    <span
      class={cn(
        "pointer-events-none block size-4 rounded-full bg-background shadow-xs transition-transform",
        props.checked ? "translate-x-4" : "translate-x-0.5",
      )}
    />
  </button>
);

const VaultRow = (props: {
  vault: Vault;
  link: VaultLink | undefined;
  busy: boolean;
  onToggle: (checked: boolean) => void;
  onRole: (role: VaultRole) => void;
}) => {
  const enabled = () => props.link !== undefined;
  const editable = () => mayManage(props.vault);
  return (
    <li
      class={cn(
        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors",
        enabled() ? "border-border bg-muted/40" : "border-transparent hover:bg-muted/20",
      )}
    >
      <div class="flex min-w-0 flex-1 items-center gap-2.5">
        <Toggle
          checked={enabled()}
          disabled={props.busy || !editable()}
          label={vaultName(props.vault)}
          onChange={props.onToggle}
        />
        <Icon icon={Lock} class="size-3.5 shrink-0 text-muted-foreground" />
        <span class={cn("truncate text-xs", enabled() ? "font-medium" : "text-muted-foreground")}>
          {vaultName(props.vault)}
        </span>
      </div>
      <Show
        when={props.link}
        fallback={<span class="text-xs text-muted-foreground">{m.groups_no_access()}</span>}
      >
        {(link) => (
          <Show
            when={editable()}
            fallback={<span class="text-xs text-muted-foreground">{roleText(link().role)}</span>}
          >
            <RoleSelect
              label={m.groups_vault_role_of({ name: vaultName(props.vault) })}
              value={link().role}
              disabled={props.busy}
              onChange={props.onRole}
            />
          </Show>
        )}
      </Show>
    </li>
  );
};

const MemberRow = (props: {
  person: MemberView;
  inGroup: boolean;
  keeper: boolean;
  busy: boolean;
  onToggle: (checked: boolean) => void;
}) => {
  const label = () => props.person.name ?? m.vault_members_unnamed();
  return (
    <li
      class={cn(
        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors",
        props.inGroup ? "border-border bg-muted/40" : "border-transparent hover:bg-muted/20",
      )}
    >
      <div class="flex min-w-0 flex-1 items-center gap-2.5">
        <Toggle
          checked={props.inGroup}
          disabled={props.busy || !props.keeper}
          label={label()}
          onChange={props.onToggle}
        />
        <span
          aria-hidden="true"
          class="grid size-6 shrink-0 place-items-center rounded-full border border-border bg-background text-xs font-medium"
        >
          {initialsOf(label())}
        </span>
        <span
          class={cn("truncate text-xs", props.inGroup ? "font-medium" : "text-muted-foreground")}
        >
          {label()}
        </span>
      </div>
    </li>
  );
};

export const GroupDetail = (props: {
  group: Group;
  vaults: Vault[];
  links: VaultLink[];
  people: MemberView[];
  keeper: boolean;
  busy: boolean;
  feedback: string | undefined;
  onToggleVault: (vault: Vault, checked: boolean) => void;
  onVaultRole: (vault: Vault, role: VaultRole) => void;
  onToggleMember: (person: MemberView, checked: boolean) => void;
  onDelete: () => void;
}) => {
  const linkOf = (vault: Vault) => props.links.find((l) => l.vault.idText === vault.idText);
  const isMember = (person: MemberView) =>
    props.group.members.some((accountId) => idKey(accountId) === idKey(person.accountId));
  return (
    <div class="overflow-hidden rounded-2xl border border-border bg-card">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
        <div class="min-w-0">
          <h2 class="truncate text-sm font-semibold">{props.group.name}</h2>
          <p class="text-xs text-muted-foreground">
            {m.groups_vaults_count({ count: props.links.length })} ·{" "}
            {m.groups_members({ count: props.group.members.length })}
          </p>
        </div>
        <Show when={props.keeper}>
          <Button variant="ghost" disabled={props.busy} onClick={props.onDelete}>
            {m.groups_delete()}
          </Button>
        </Show>
      </div>

      <div class="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div class="p-4">
          <div class="mb-2.5 flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {m.groups_vaults_heading()}
            </h3>
            <span class="text-xs text-muted-foreground">{m.groups_vaults_sub()}</span>
          </div>
          <Show
            when={props.vaults.length > 0}
            fallback={<p class="px-1 py-2 text-xs text-muted-foreground">{m.groups_no_vaults()}</p>}
          >
            <ul class="space-y-1.5" aria-label={m.groups_vaults_of({ name: props.group.name })}>
              <For each={props.vaults}>
                {(vault) => (
                  <VaultRow
                    vault={vault}
                    link={linkOf(vault)}
                    busy={props.busy}
                    onToggle={(checked) => props.onToggleVault(vault, checked)}
                    onRole={(role) => props.onVaultRole(vault, role)}
                  />
                )}
              </For>
            </ul>
          </Show>
        </div>

        <div class="p-4">
          <div class="mb-2.5 flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {m.groups_members_heading()}
            </h3>
            <span class="text-xs text-muted-foreground">{m.groups_members_sub()}</span>
          </div>
          <Show
            when={props.people.length > 0}
            fallback={
              <p class="px-1 py-2 text-xs text-muted-foreground">{m.groups_no_members()}</p>
            }
          >
            <ul class="space-y-1.5" aria-label={props.group.name}>
              <For each={props.people}>
                {(person) => (
                  <MemberRow
                    person={person}
                    inGroup={isMember(person)}
                    keeper={props.keeper}
                    busy={props.busy}
                    onToggle={(checked) => props.onToggleMember(person, checked)}
                  />
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>

      <Show when={props.feedback}>
        {(text) => (
          <p class="border-t border-border bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">
            {text()}
          </p>
        )}
      </Show>
    </div>
  );
};
