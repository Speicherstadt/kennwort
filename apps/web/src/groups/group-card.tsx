/**
 * One group card on the Groups page: shows both the vaults linked to the group and the group's
 * members. Before adding a person or linking a vault, it previews which vaults or people this
 * device will grant directly and which ones remain access requests.
 */

import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { idKey, type MemberView, type VaultRole } from "@kennwort/core";
import { Badge, Button, Icon, m, selectClass } from "@kennwort/ui";
import { Lock, Users } from "@kennwort/ui/icons";
import { createMemo, createSignal, For, Show } from "solid-js";
import { RoleSelect } from "../vaults/role-select.tsx";
import { mayManage } from "../vaults/vault-members.ts";
import { roleText } from "../vaults/vault-text.ts";
import {
  type CertifiedPerson,
  type JoinPlan,
  linkableVaults,
  planJoinAccess,
  planLinkAccess,
  type VaultLink,
} from "./group-access.ts";
import { type Group, outsideGroup } from "./groups.ts";

const sectionHeadClass =
  "border-t border-border bg-muted/20 px-4 py-2 text-xs font-semibold text-muted-foreground";
const previewClass = "mt-1.5 text-xs text-muted-foreground";

const personName = (people: readonly MemberView[], accountId: Uint8Array) =>
  people.find((p) => idKey(p.accountId) === idKey(accountId))?.name ?? m.vault_members_unnamed();

const vaultName = (vault: Vault) => vault.name ?? m.vaults_unnamed();

const LinkVaultForm = (props: {
  group: Group;
  vaults: Vault[];
  people: MemberView[];
  busy: boolean;
  onLink: (vault: Vault, role: VaultRole, directGrant: CertifiedPerson[]) => void;
}) => {
  const [chosen, setChosen] = createSignal("");
  const [role, setRole] = createSignal<VaultRole>("read");
  const selectedVault = createMemo(() => props.vaults.find((v) => v.idText === chosen()));
  const plan = createMemo(() => {
    const vault = selectedVault();
    return vault ? planLinkAccess(props.group, vault, props.people) : undefined;
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const vault = selectedVault();
    const currentPlan = plan();
    if (!vault || !currentPlan) return;
    props.onLink(vault, role(), currentPlan.directGrant);
    setChosen("");
  };
  return (
    <form class="border-t border-border bg-muted/40 px-4 py-3" onSubmit={submit}>
      <div class="flex flex-wrap items-center gap-2">
        <select
          aria-label={m.groups_vault_for({ name: props.group.name })}
          class={selectClass}
          value={chosen()}
          onChange={(event) => setChosen(event.currentTarget.value)}
        >
          <option value="">{m.groups_vault_choose()}</option>
          <For each={props.vaults}>
            {(vault) => <option value={vault.idText}>{vaultName(vault)}</option>}
          </For>
        </select>
        <RoleSelect
          label={m.vault_groups_role()}
          value={role()}
          disabled={false}
          onChange={setRole}
        />
        <Button type="submit" disabled={props.busy || chosen() === ""}>
          {m.vault_groups_link()}
        </Button>
      </div>
      <Show when={plan()}>
        {(p) => (
          <>
            <Show when={p().directGrant.length > 0}>
              <p class={previewClass}>
                {m.groups_preview_grant_people({
                  people: p()
                    .directGrant.map((person) => person.name ?? m.vault_members_unnamed())
                    .join(", "),
                })}
              </p>
            </Show>
            <Show when={p().willRequest.length > 0}>
              <p class={previewClass}>
                {m.groups_preview_request_people({
                  people: p()
                    .willRequest.map((person) => person.name ?? m.vault_members_unnamed())
                    .join(", "),
                })}
              </p>
            </Show>
          </>
        )}
      </Show>
    </form>
  );
};

const AddMemberForm = (props: {
  group: Group;
  people: MemberView[];
  links: VaultLink[];
  busy: boolean;
  onAdd: (person: MemberView, plan: JoinPlan) => void;
}) => {
  const [chosen, setChosen] = createSignal("");
  const selected = createMemo(() => props.people.find((p) => idKey(p.accountId) === chosen()));
  const plan = createMemo(() => {
    const person = selected();
    return person ? planJoinAccess(person, props.group.id, props.links) : undefined;
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const person = selected();
    const currentPlan = plan();
    if (!person || !currentPlan) return;
    props.onAdd(person, currentPlan);
    setChosen("");
  };
  return (
    <form class="border-t border-border bg-muted/40 px-4 py-3" onSubmit={submit}>
      <div class="flex flex-wrap gap-2">
        <select
          aria-label={m.groups_person_for({ name: props.group.name })}
          class={selectClass}
          value={chosen()}
          onChange={(event) => setChosen(event.currentTarget.value)}
        >
          <option value="">{m.vault_members_choose()}</option>
          <For each={outsideGroup(props.group, props.people)}>
            {(person) => (
              <option value={idKey(person.accountId)}>
                {person.name ?? m.vault_members_unnamed()}
              </option>
            )}
          </For>
        </select>
        <Button type="submit" disabled={props.busy || chosen() === ""}>
          {m.groups_add_member()}
        </Button>
      </div>
      <Show when={plan()}>
        {(p) => (
          <>
            <Show when={p().directGrant.length > 0}>
              <p class={previewClass}>
                {m.groups_preview_grant_vaults({
                  vaults: p()
                    .directGrant.map((d) => `${vaultName(d.vault)} (${roleText(d.role)})`)
                    .join(", "),
                })}
              </p>
            </Show>
            <Show when={p().willRequest.length > 0}>
              <p class={previewClass}>
                {m.groups_preview_request_vaults({
                  vaults: p()
                    .willRequest.map((v) => vaultName(v))
                    .join(", "),
                })}
              </p>
            </Show>
          </>
        )}
      </Show>
    </form>
  );
};

export const GroupCard = (props: {
  group: Group;
  people: MemberView[];
  vaults: Vault[];
  links: VaultLink[];
  keeper: boolean;
  busy: boolean;
  onAdd: (person: MemberView, plan: JoinPlan) => void;
  onRemove: (accountId: Uint8Array) => void;
  onLink: (vault: Vault, role: VaultRole, directGrant: CertifiedPerson[]) => void;
  onUnlink: (vault: Vault) => void;
  onDelete: () => void;
}) => {
  const linkable = createMemo(() => linkableVaults(props.group.id, props.vaults, props.links));
  return (
    <li class="overflow-hidden rounded-xl border border-border">
      <div class="flex flex-wrap items-center gap-2 px-4 py-3">
        <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-accent">
          <Icon icon={Users} />
        </span>
        <h2 class="flex-1 truncate font-semibold">{props.group.name}</h2>
        <Badge variant="secondary">{m.groups_vaults_count({ count: props.links.length })}</Badge>
        <Badge variant="secondary">{m.groups_members({ count: props.group.members.length })}</Badge>
        <Show when={props.keeper}>
          <Button disabled={props.busy} onClick={props.onDelete}>
            {m.groups_delete()}
          </Button>
        </Show>
      </div>

      <h3 class={sectionHeadClass}>{m.groups_vaults_heading()}</h3>
      <Show when={props.links.length === 0}>
        <p class="border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
          {m.groups_no_vaults()}
        </p>
      </Show>
      <ul
        class="divide-y divide-border border-t border-border empty:hidden"
        aria-label={m.groups_vaults_of({ name: props.group.name })}
      >
        <For each={props.links}>
          {(link) => (
            <li class="flex items-center gap-2 px-4 py-2">
              <Icon icon={Lock} class="shrink-0 text-muted-foreground" />
              <span class="flex-1 truncate">{vaultName(link.vault)}</span>
              <span class="text-xs text-muted-foreground">{roleText(link.role)}</span>
              <Show when={mayManage(link.vault)}>
                <Button
                  variant="ghost"
                  disabled={props.busy}
                  onClick={() => props.onUnlink(link.vault)}
                >
                  {m.vault_groups_unlink()}
                </Button>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={linkable().length > 0}>
        <LinkVaultForm
          group={props.group}
          vaults={linkable()}
          people={props.people}
          busy={props.busy}
          onLink={props.onLink}
        />
      </Show>

      <h3 class={sectionHeadClass}>{m.groups_members_heading()}</h3>
      <Show when={props.group.members.length === 0}>
        <p class="border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
          {m.groups_no_members()}
        </p>
      </Show>
      <ul
        class="divide-y divide-border border-t border-border empty:hidden"
        aria-label={props.group.name}
      >
        <For each={props.group.members}>
          {(accountId) => (
            <li class="flex items-center gap-2 py-2 pr-3 pl-15">
              <span class="flex-1 truncate">{personName(props.people, accountId)}</span>
              <Show when={props.keeper}>
                <Button
                  variant="ghost"
                  disabled={props.busy}
                  onClick={() => props.onRemove(accountId)}
                >
                  {m.groups_remove_member()}
                </Button>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.keeper}>
        <AddMemberForm
          group={props.group}
          people={props.people}
          links={props.links}
          busy={props.busy}
          onAdd={props.onAdd}
        />
      </Show>
    </li>
  );
};
