/**
 * The members of one vault in a dialog (K-305 part 3): everyone the checked log names with their
 * role; a manager changes roles, removes members and adds certified people of the company. Every
 * change is an entry the manager's device signs (P-05, P-06); removing someone also rotates the
 * vault key and writes every entry anew (K-307, P-11).
 */

import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import type { Certificate, MemberView, VaultRole } from "@kennwort/core";
import { idKey } from "@kennwort/core";
import { Button, Dialog, Input, m, selectClass } from "@kennwort/ui";
import { createSignal, For, Show } from "solid-js";
import { linkedGroupNames, outsideLinkedGroups } from "../groups/groups.ts";
import type { Session } from "../session/session.ts";
import { dateText, endOfDay, today } from "./day.ts";
import { createDialogState, type DialogApi, type Outcome } from "./dialog-state.ts";
import type { ExitError } from "./exit.ts";
import { RoleSelect } from "./role-select.tsx";
import { VaultGroups } from "./vault-groups.tsx";
import {
  addToVault,
  candidates,
  declineRequest,
  grantRequest,
  hasExpired,
  mayManage,
  type VaultMember,
  vaultMembers,
} from "./vault-members.ts";
import { VaultRequests } from "./vault-requests.tsx";
import type { VaultStore } from "./vault-store.ts";
import { roleText } from "./vault-text.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const errorText = (error: ExitError) => {
  if (error === "stale") return m.vault_members_stale();
  if (error === "past") return m.vault_members_past();
  if (error === "uncertified-member") return m.vault_members_uncertified();
  // The rotation is in the log; only writing the entries anew failed, which a catch-up repeats
  if (error === "not-saved" || error === "rotation-due") return m.vault_members_rewrite_failed();
  return m.vault_members_failed();
};

const nameOf = (person: { name: string | null }) => person.name ?? m.vault_members_unnamed();

const MemberRow = (props: {
  member: VaultMember;
  /** Names of linked groups this member belongs to */
  viaGroups: string[];
  /** In none of the vault's linked groups (any more): a manager may want to remove them */
  outside: boolean;
  editable: boolean;
  busy: boolean;
  onRole: (role: VaultRole) => void;
  onRemove: () => void;
}) => (
  <li class="flex flex-wrap items-center gap-2 px-3 py-2">
    <span class="flex-1 truncate">
      {nameOf(props.member)}
      <Show when={props.member.me}> {m.vault_members_you()}</Show>
      <Show when={props.viaGroups.length > 0}>
        <span class="ml-2 text-xs text-muted-foreground">
          {m.vault_groups_via({ groups: props.viaGroups.join(", ") })}
        </span>
      </Show>
      <Show when={props.viaGroups.length === 0 && props.outside}>
        <span class="ml-2 text-xs text-muted-foreground">{m.vault_groups_outside()}</span>
      </Show>
      <Show when={props.member.validUntil !== 0}>
        <span class="ml-2 text-xs text-muted-foreground">
          {hasExpired(props.member)
            ? m.vault_members_expired()
            : m.vault_members_until({ date: dateText(props.member.validUntil) })}
        </span>
      </Show>
    </span>
    <Show
      when={props.editable && !props.member.me}
      fallback={<span class="text-xs text-muted-foreground">{roleText(props.member.role)}</span>}
    >
      <RoleSelect
        label={m.vault_members_role_of({ name: nameOf(props.member) })}
        value={props.member.role}
        disabled={props.busy}
        onChange={props.onRole}
      />
      <Button
        disabled={props.busy}
        aria-label={m.vault_members_remove_of({ name: nameOf(props.member) })}
        onClick={props.onRemove}
      >
        {m.vault_members_remove()}
      </Button>
    </Show>
  </li>
);

const AddForm = (props: {
  people: (MemberView & { certificate: Certificate })[];
  busy: boolean;
  onAdd: (person: Certificate, role: VaultRole, validUntil: number) => void;
}) => {
  const [chosen, setChosen] = createSignal("");
  const [role, setRole] = createSignal<VaultRole>("read");
  const [until, setUntil] = createSignal("");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const person = props.people.find((p) => idKey(p.accountId) === chosen());
    if (person) props.onAdd(person.certificate, role(), endOfDay(until()));
  };
  return (
    <form class="grid gap-2" onSubmit={submit}>
      <h3 class="text-sm font-semibold">{m.vault_members_add_title()}</h3>
      <select
        aria-label={m.vault_members_person()}
        class={selectClass}
        value={chosen()}
        required
        onChange={(event) => setChosen(event.currentTarget.value)}
      >
        <option value="">{m.vault_members_choose()}</option>
        <For each={props.people}>
          {(person) => <option value={idKey(person.accountId)}>{nameOf(person)}</option>}
        </For>
      </select>
      <RoleSelect
        label={m.vault_members_new_role()}
        value={role()}
        disabled={false}
        onChange={setRole}
      />
      <Input
        label={m.vault_members_until_label()}
        hint={m.vault_members_until_hint()}
        type="date"
        min={today()}
        value={until()}
        onInput={(event) => setUntil(event.currentTarget.value)}
      />
      <Button type="submit" disabled={props.busy || chosen() === ""}>
        {m.vault_members_add()}
      </Button>
    </form>
  );
};

export const VaultMembersDialog = (props: {
  open: boolean;
  onClose: () => void;
  vault: Vault;
  people: MemberView[];
  api: DialogApi;
  session: Session;
  store: VaultStore;
  /** Takes someone out of the vault and rotates its key (exit.ts) */
  onRemove: (accountId: Uint8Array) => Promise<Outcome>;
  /** Another role; down to reading re-saves their entries first (demote.ts) */
  onRole: (accountId: Uint8Array, role: VaultRole) => Promise<Outcome>;
}) => {
  const state = createDialogState(props);
  const { busy, error, requests, run } = state;
  const { api, session } = props;
  const me = () => props.session.opened()?.accountId ?? new Uint8Array();
  const outside = () => outsideLinkedGroups(props.vault, state.links(), state.groups());
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={m.vault_members_title({ name: props.vault.name ?? m.vaults_unnamed() })}
      size="lg"
    >
      <ul
        class="mb-4 divide-y divide-border rounded-xl border border-border"
        aria-label={m.vault_members_list()}
      >
        <For each={vaultMembers(props.vault, props.people, me())}>
          {(member) => (
            <MemberRow
              member={member}
              viaGroups={linkedGroupNames(member.accountId, state.links(), state.groups())}
              outside={outside().has(idKey(member.accountId))}
              editable={mayManage(props.vault)}
              busy={busy()}
              onRole={(role) => run(() => props.onRole(member.accountId, role))}
              onRemove={() => run(() => props.onRemove(member.accountId))}
            />
          )}
        </For>
      </ul>
      <VaultGroups groups={state.groups()} links={state.links()} />
      <VaultRequests
        requests={requests()}
        busy={busy()}
        onGrant={(request, role) => {
          const certificate = request.certificate;
          if (certificate)
            void run(() =>
              grantRequest(api, session, props.vault, { ...request, certificate }, role),
            );
        }}
        onDecline={(request) =>
          void run(() => declineRequest(api, session, props.vault, request.accountId))
        }
      />
      <Show when={error()}>
        {(e) => (
          <p class={alertClass} role="alert">
            {errorText(e())}
          </p>
        )}
      </Show>
      <Show when={mayManage(props.vault) && candidates(props.vault, props.people).length > 0}>
        <AddForm
          people={candidates(props.vault, props.people)}
          busy={busy()}
          onAdd={(person, role, until) =>
            run(() => addToVault(api, session, props.vault, person, role, until))
          }
        />
      </Show>
    </Dialog>
  );
};
