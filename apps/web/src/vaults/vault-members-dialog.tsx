/**
 * The members of one vault in a dialog (K-305 part 3): everyone the checked log names with their
 * role; a manager changes roles, removes members and adds certified people of the company. Every
 * change is an entry the manager's device signs (P-05, P-06).
 */
import type { Certificate, MemberView, VaultRole } from "@kennwort/core";
import { idKey } from "@kennwort/core";
import { Button, Dialog, m } from "@kennwort/ui";
import { createSignal, For, Show } from "solid-js";
import type { Session } from "../session/session.ts";
import {
  addToVault,
  type ChangeError,
  candidates,
  changeVaultRole,
  mayManage,
  removeFromVault,
  type VaultMember,
  vaultMembers,
} from "./vault-members.ts";
import type { VaultStore } from "./vault-store.ts";
import { roleText } from "./vault-text.ts";
import type { Vault, VaultDeps } from "./vaults.ts";

const ROLES: VaultRole[] = ["read", "edit", "manage"];
const selectClass = "h-11 rounded-md border border-border bg-background px-2 text-xs md:h-8";
const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const errorText = (error: ChangeError) =>
  error === "stale" ? m.vault_members_stale() : m.vault_members_failed();

const nameOf = (person: { name: string | null }) => person.name ?? m.vault_members_unnamed();

const RoleSelect = (props: {
  label: string;
  value: VaultRole;
  disabled: boolean;
  onChange: (role: VaultRole) => void;
}) => (
  <select
    aria-label={props.label}
    class={selectClass}
    disabled={props.disabled}
    value={props.value}
    onChange={(event) => props.onChange(event.currentTarget.value as VaultRole)}
  >
    <For each={ROLES}>{(role) => <option value={role}>{roleText(role)}</option>}</For>
  </select>
);

const MemberRow = (props: {
  member: VaultMember;
  editable: boolean;
  busy: boolean;
  onRole: (role: VaultRole) => void;
  onRemove: () => void;
}) => (
  <li class="flex flex-wrap items-center gap-2 px-3 py-2">
    <span class="flex-1 truncate">
      {nameOf(props.member)}
      <Show when={props.member.me}> {m.vault_members_you()}</Show>
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
      <Button disabled={props.busy} onClick={props.onRemove}>
        {m.vault_members_remove()}
      </Button>
    </Show>
  </li>
);

const AddForm = (props: {
  people: (MemberView & { certificate: Certificate })[];
  busy: boolean;
  onAdd: (person: Certificate, role: VaultRole) => void;
}) => {
  const [chosen, setChosen] = createSignal("");
  const [role, setRole] = createSignal<VaultRole>("read");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const person = props.people.find((p) => idKey(p.accountId) === chosen());
    if (person) props.onAdd(person.certificate, role());
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
  api: VaultDeps;
  session: Session;
  store: VaultStore;
}) => {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<ChangeError>();
  const run = async (change: () => ReturnType<typeof addToVault>) => {
    setBusy(true);
    setError(await props.store.change(change));
    setBusy(false);
  };
  const me = () => props.session.opened()?.accountId ?? new Uint8Array();
  const { api, session } = props;
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={m.vault_members_title({ name: props.vault.name ?? m.vaults_unnamed() })}
    >
      <ul
        class="mb-4 divide-y divide-border rounded-xl border border-border"
        aria-label={m.vault_members_list()}
      >
        <For each={vaultMembers(props.vault, props.people, me())}>
          {(member) => (
            <MemberRow
              member={member}
              editable={mayManage(props.vault)}
              busy={busy()}
              onRole={(role) =>
                run(() => changeVaultRole(api, session, props.vault, member.accountId, role))
              }
              onRemove={() =>
                run(() => removeFromVault(api, session, props.vault, member.accountId))
              }
            />
          )}
        </For>
      </ul>
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
          onAdd={(person, role) => run(() => addToVault(api, session, props.vault, person, role))}
        />
      </Show>
    </Dialog>
  );
};
