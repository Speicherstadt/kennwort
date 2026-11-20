/**
 * Groups linked to a vault, in its members dialog (K-305 part 5): a manager links a group with a
 * role, so everyone in it (and who joins later) shows up under "Anfragen"; nobody gets in without
 * the manager granting it. Unlinking asks nothing and removes nobody.
 */
import type { VaultRole } from "@kennwort/core";
import { Button, m } from "@kennwort/ui";
import { createSignal, For, Show } from "solid-js";
import type { Group, Link } from "../groups/groups.ts";
import { RoleSelect, selectClass } from "./role-select.tsx";
import { roleText } from "./vault-text.ts";

const LinkForm = (props: {
  groups: Group[];
  busy: boolean;
  onLink: (groupId: string, role: VaultRole) => void;
}) => {
  const [chosen, setChosen] = createSignal("");
  const [role, setRole] = createSignal<VaultRole>("read");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (chosen()) props.onLink(chosen(), role());
    setChosen("");
  };
  return (
    <form class="flex flex-wrap items-center gap-2" onSubmit={submit}>
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
    </form>
  );
};

export const VaultGroups = (props: {
  groups: Group[];
  links: Link[];
  manager: boolean;
  busy: boolean;
  onLink: (groupId: string, role: VaultRole) => void;
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
        <LinkForm groups={unlinked()} busy={props.busy} onLink={props.onLink} />
      </Show>
      <p class="mt-1 mb-4 text-xs text-muted-foreground">{m.vault_groups_hint()}</p>
    </Show>
  );
};
