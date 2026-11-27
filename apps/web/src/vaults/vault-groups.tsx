/**
 * Groups linked to a vault, in its members dialog (K-305 part 5): a manager links a group with a
 * role. Verified group members not yet in the vault are previewed and granted directly by this
 * device; unverified members and future OIDC joins appear under "Anfragen". Unlinking takes
 * nobody's access.
 */
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import type { MemberView, VaultRole } from "@kennwort/core";
import { Button, m, selectClass } from "@kennwort/ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { type CertifiedPerson, planLinkAccess } from "../groups/group-access.ts";
import type { Group, Link } from "../groups/groups.ts";
import { RoleSelect } from "./role-select.tsx";
import { roleText } from "./vault-text.ts";

const previewClass = "mt-1.5 text-xs text-muted-foreground";

const LinkForm = (props: {
  groups: Group[];
  vault: Vault;
  people: MemberView[];
  busy: boolean;
  onLink: (groupId: string, role: VaultRole, directGrant: CertifiedPerson[]) => void;
}) => {
  const [chosen, setChosen] = createSignal("");
  const [role, setRole] = createSignal<VaultRole>("read");
  const selected = createMemo(() => props.groups.find((g) => g.id === chosen()));
  const plan = createMemo(() => {
    const group = selected();
    return group ? planLinkAccess(group, props.vault, props.people) : undefined;
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const current = selected();
    const currentPlan = plan();
    if (!current || !currentPlan) return;
    props.onLink(current.id, role(), currentPlan.directGrant);
    setChosen("");
  };
  return (
    <form onSubmit={submit}>
      <div class="flex flex-wrap items-center gap-2">
        <select
          aria-label={m.vault_groups_choose_label()}
          class={selectClass}
          value={chosen()}
          onChange={(event) => setChosen(event.currentTarget.value)}
        >
          <option value="">{m.vault_groups_choose()}</option>
          <For each={props.groups}>{(group) => <option value={group.id}>{group.name}</option>}</For>
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

export const VaultGroups = (props: {
  groups: Group[];
  links: Link[];
  vault: Vault;
  people: MemberView[];
  manager: boolean;
  busy: boolean;
  onLink: (groupId: string, role: VaultRole, directGrant: CertifiedPerson[]) => void;
  onUnlink: (groupId: string) => void;
}) => {
  const nameOf = (groupId: string) =>
    props.groups.find((g) => g.id === groupId)?.name ?? m.vault_groups_unknown();
  const unlinked = () => props.groups.filter((g) => !props.links.some((l) => l.groupId === g.id));
  return (
    <Show when={props.links.length > 0 || (props.manager && props.groups.length > 0)}>
      <h3 class="mb-1 text-sm font-semibold">{m.vault_groups_title()}</h3>
      <Show when={props.links.length > 0}>
        <ul
          class="mb-2 divide-y divide-border rounded-xl border border-border"
          aria-label={m.vault_groups_title()}
        >
          <For each={props.links}>
            {(link) => (
              <li class="flex flex-wrap items-center gap-2 px-3 py-2">
                <span class="flex-1 truncate">{nameOf(link.groupId)}</span>
                <span class="text-xs text-muted-foreground">{roleText(link.role)}</span>
                <Show when={props.manager}>
                  <Button disabled={props.busy} onClick={() => props.onUnlink(link.groupId)}>
                    {m.vault_groups_unlink()}
                  </Button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={props.manager && unlinked().length > 0}>
        <LinkForm
          groups={unlinked()}
          vault={props.vault}
          people={props.people}
          busy={props.busy}
          onLink={props.onLink}
        />
      </Show>
      <p class="mt-1 mb-4 text-xs text-muted-foreground">{m.vault_groups_hint()}</p>
    </Show>
  );
};
