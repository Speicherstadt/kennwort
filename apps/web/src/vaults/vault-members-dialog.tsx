/**
 * The members of one vault in a dialog (K-305 part 3): compact single-row add bar at the top (with
 * optional time-limit toggle), clean member rows with initials, via-group chips, compact role
 * select, and icon remove button. Every change is signed by the manager's device (P-05, P-06);
 * removing someone rotates the vault key and rewrites entries (K-307, P-11).
 */

import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import type { Certificate, MemberView, VaultRole } from "@kennwort/core";
import { idKey } from "@kennwort/core";
import { Button, Dialog, Icon, Input, m, selectClass } from "@kennwort/ui";
import { X } from "@kennwort/ui/icons";
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

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

const MemberRow = (props: {
  member: VaultMember;
  viaGroups: string[];
  outside: boolean;
  editable: boolean;
  busy: boolean;
  onRole: (role: VaultRole) => void;
  onRemove: () => void;
}) => (
  <li class="flex items-center justify-between gap-3 py-2.5">
    <div class="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        class="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-muted text-xs font-medium"
      >
        {initialsOf(nameOf(props.member))}
      </span>
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="truncate text-sm font-medium">{nameOf(props.member)}</span>
          <Show when={props.member.me}>
            <span class="text-xs text-muted-foreground">{m.vault_members_you()}</span>
          </Show>
          <Show when={props.viaGroups.length > 0}>
            <span class="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground">
              {m.vault_groups_via({ groups: props.viaGroups.join(", ") })}
            </span>
          </Show>
          <Show when={props.viaGroups.length === 0 && props.outside}>
            <span class="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground">
              {m.vault_groups_outside()}
            </span>
          </Show>
        </div>
        <Show when={props.member.validUntil !== 0}>
          <p class="text-xs text-muted-foreground">
            {hasExpired(props.member)
              ? m.vault_members_expired()
              : m.vault_members_until({ date: dateText(props.member.validUntil) })}
          </p>
        </Show>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      <Show
        when={props.editable && !props.member.me}
        fallback={
          <span class="px-2 text-xs text-muted-foreground">{roleText(props.member.role)}</span>
        }
      >
        <RoleSelect
          label={m.vault_members_role_of({ name: nameOf(props.member) })}
          value={props.member.role}
          disabled={props.busy}
          onChange={props.onRole}
        />
        <Button
          variant="ghost"
          size="icon"
          disabled={props.busy}
          title={m.vault_members_remove()}
          aria-label={m.vault_members_remove_of({ name: nameOf(props.member) })}
          onClick={props.onRemove}
        >
          <Icon icon={X} />
        </Button>
      </Show>
    </div>
  </li>
);

const AddForm = (props: {
  people: (MemberView & { certificate: Certificate })[];
  busy: boolean;
  onAdd: (person: Certificate, role: VaultRole, validUntil: number) => void;
}) => {
  const [chosen, setChosen] = createSignal("");
  const [role, setRole] = createSignal<VaultRole>("read");
  const [showUntil, setShowUntil] = createSignal(false);
  const [until, setUntil] = createSignal("");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const person = props.people.find((p) => idKey(p.accountId) === chosen());
    if (!person) return;
    props.onAdd(person.certificate, role(), showUntil() ? endOfDay(until()) : 0);
    setChosen("");
    setUntil("");
    setShowUntil(false);
  };
  return (
    <form class="mb-4 rounded-xl border border-border bg-muted/30 p-3" onSubmit={submit}>
      <div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <select
          aria-label={m.vault_members_person()}
          class={`${selectClass} min-w-0 flex-1`}
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
        <Button type="submit" variant="primary" disabled={props.busy || chosen() === ""}>
          {m.vault_members_add()}
        </Button>
      </div>
      <div class="mt-2">
        <button
          type="button"
          class="text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            setShowUntil((open) => !open);
            setUntil("");
          }}
        >
          {showUntil() ? m.vault_members_hide_time() : m.vault_members_limit_time()}
        </button>
      </div>
      <Show when={showUntil()}>
        <div class="mt-2">
          <Input
            label={m.vault_members_until_label()}
            hint={m.vault_members_until_hint()}
            type="date"
            min={today()}
            value={until()}
            onInput={(event) => setUntil(event.currentTarget.value)}
          />
        </div>
      </Show>
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
  onRemove: (accountId: Uint8Array) => Promise<Outcome>;
  onRole: (accountId: Uint8Array, role: VaultRole) => Promise<Outcome>;
  onManageGroups?: (() => void) | undefined;
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
      <Show when={mayManage(props.vault) && candidates(props.vault, props.people).length > 0}>
        <AddForm
          people={candidates(props.vault, props.people)}
          busy={busy()}
          onAdd={(person, role, until) =>
            run(() => addToVault(api, session, props.vault, person, role, until))
          }
        />
      </Show>
      <Show when={error()}>
        {(e) => (
          <p class={`mb-3 ${alertClass}`} role="alert">
            {errorText(e())}
          </p>
        )}
      </Show>
      <ul class="divide-y divide-border" aria-label={m.vault_members_list()}>
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
      <VaultGroups groups={state.groups()} links={state.links()} onManage={props.onManageGroups} />
    </Dialog>
  );
};
