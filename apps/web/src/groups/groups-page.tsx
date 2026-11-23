/**
 * Groups (K-305 part 5): the company's groups with their members. Owners and admins create and
 * delete groups and change their members; joining a group asks the managers of its vaults, it
 * gives no access by itself (DESIGN.md: show trust, don't claim it).
 */

import type { GroupApi } from "@kennwort/client/session/groups-api.ts";
import { idKey, type MemberView } from "@kennwort/core";
import { Button, Icon, Input, m, pageClass, selectClass } from "@kennwort/ui";
import { Users } from "@kennwort/ui/icons";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Loading, Show } from "solid-js";
import { queryKeys } from "../queries.ts";
import type { Session } from "../session/session.ts";
import {
  createGroup,
  deleteGroup,
  type Group,
  joinGroup,
  leaveGroup,
  loadGroups,
  mayKeepGroups,
  outsideGroup,
} from "./groups.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";
const nameOf = (people: MemberView[], accountId: Uint8Array) =>
  people.find((p) => idKey(p.accountId) === idKey(accountId))?.name ?? m.vault_members_unnamed();

const AddMember = (props: {
  group: Group;
  people: MemberView[];
  busy: boolean;
  onAdd: (accountId: Uint8Array) => void;
}) => {
  const [chosen, setChosen] = createSignal("");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const person = props.people.find((p) => idKey(p.accountId) === chosen());
    if (person) props.onAdd(person.accountId);
    setChosen("");
  };
  return (
    <form class="flex flex-wrap gap-2 px-3 py-2" onSubmit={submit}>
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
    </form>
  );
};

const GroupCard = (props: {
  group: Group;
  people: MemberView[];
  keeper: boolean;
  busy: boolean;
  onAdd: (accountId: Uint8Array) => void;
  onRemove: (accountId: Uint8Array) => void;
  onDelete: () => void;
}) => (
  <li class="rounded-xl border border-border">
    <div class="flex items-center gap-3 px-3.5 py-2.5">
      <Icon icon={Users} />
      <h2 class="flex-1 font-semibold">{props.group.name}</h2>
      <span class="text-xs text-muted-foreground">
        {m.groups_members({ count: props.group.members.length })}
      </span>
      <Show when={props.keeper}>
        <Button disabled={props.busy} onClick={props.onDelete}>
          {m.groups_delete()}
        </Button>
      </Show>
    </div>
    <ul class="divide-y divide-border border-t border-border" aria-label={props.group.name}>
      <For each={props.group.members}>
        {(accountId) => (
          <li class="flex items-center gap-2 px-3 py-2">
            <span class="flex-1 truncate">{nameOf(props.people, accountId)}</span>
            <Show when={props.keeper}>
              <Button disabled={props.busy} onClick={() => props.onRemove(accountId)}>
                {m.groups_remove_member()}
              </Button>
            </Show>
          </li>
        )}
      </For>
    </ul>
    <Show when={props.keeper}>
      <AddMember group={props.group} people={props.people} busy={props.busy} onAdd={props.onAdd} />
    </Show>
  </li>
);

const CreateGroup = (props: { busy: boolean; onCreate: (name: string) => void }) => {
  const [name, setName] = createSignal("");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!name().trim()) return;
    props.onCreate(name());
    setName("");
  };
  return (
    <form class="mt-6 grid max-w-md gap-2" onSubmit={submit}>
      <h2 class="font-semibold">{m.groups_create_title()}</h2>
      <Input
        label={m.groups_create_name()}
        value={name()}
        maxlength={100}
        required
        onInput={(event) => setName(event.currentTarget.value)}
      />
      <Button type="submit" disabled={props.busy}>
        {m.groups_create()}
      </Button>
    </form>
  );
};

export const GroupsPage = (props: {
  api: GroupApi;
  session: Session;
  people: () => MemberView[] | undefined;
}) => {
  const client = useQueryClient();
  // null for groups that did not load: a query holds a value, never undefined
  const groups = useQuery(() => ({
    queryKey: queryKeys.groups,
    queryFn: async () => (await loadGroups(props.api, props.session)) ?? null,
  }));
  const [changeFailed, setChangeFailed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const run = async (change: () => Promise<{ ok: boolean }>) => {
    setBusy(true);
    const result = await change();
    await client.invalidateQueries({ queryKey: queryKeys.groups });
    setChangeFailed(!result.ok);
    setBusy(false);
  };
  const people = () => props.people() ?? [];
  const keeper = () => {
    const id = props.session.opened()?.accountId;
    return mayKeepGroups(people().find((p) => id && idKey(p.accountId) === idKey(id)));
  };
  const { api, session } = props;
  return (
    <section aria-labelledby="page-title" class={pageClass()}>
      <h1 id="page-title" class="mb-4 text-[28px] font-semibold md:text-lg">
        {m.nav_groups()}
      </h1>
      <p class="mb-4 max-w-prose text-muted-foreground">{m.groups_intro_real()}</p>
      <Loading>
        <Show when={changeFailed() || groups.data === null}>
          <p class={alertClass} role="alert">
            {m.groups_failed()}
          </p>
        </Show>
        <ul class="grid gap-3">
          <For each={groups.data ?? []}>
            {(group) => (
              <GroupCard
                group={group}
                people={people()}
                keeper={keeper()}
                busy={busy()}
                onAdd={(accountId) => run(() => joinGroup(api, session, group.id, accountId))}
                onRemove={(accountId) => run(() => leaveGroup(api, session, group.id, accountId))}
                onDelete={() => run(() => deleteGroup(api, session, group.id))}
              />
            )}
          </For>
        </ul>
      </Loading>
      <Show when={keeper()}>
        <CreateGroup
          busy={busy()}
          onCreate={(name) => run(() => createGroup(api, session, name))}
        />
      </Show>
    </section>
  );
};
