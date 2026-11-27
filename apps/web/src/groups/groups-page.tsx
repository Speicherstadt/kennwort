/**
 * Groups (K-305 part 5): the company's groups with their linked vaults and members. Owners and
 * admins create and delete groups and change their members; managers link vaults right here or in
 * a vault's members dialog. Verified members are granted directly on vaults this device manages
 * after previewing the affected vaults; other vaults and OIDC groups remain access requests.
 */

import { idKey, type MemberView } from "@kennwort/core";
import { Button, Input, introClass, m, pageClass, panelClass, panelTitleClass } from "@kennwort/ui";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createEffect, createMemo, createSignal, For, Loading, Show } from "solid-js";
import { queryKeys } from "../queries.ts";
import type { Session } from "../session/session.ts";
import type { DialogApi } from "../vaults/dialog-state.ts";
import type { Exits } from "../vaults/exit.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import {
  joinGroupWithAccess,
  leaveGroupWithAccess,
  linkGroupWithAccess,
  linksForGroup,
  loadAllVaultLinks,
  planLeaveAccess,
  sharedVaults,
  type VaultLink,
} from "./group-access.ts";
import { GroupCard } from "./group-card.tsx";
import {
  createGroup,
  deleteGroup,
  type Group,
  leaveGroup,
  loadGroups,
  mayKeepGroups,
  unlinkGroup,
} from "./groups.ts";
import { LeaveGroupDialog, type PendingLeave } from "./leave-group-dialog.tsx";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const nameOf = (people: readonly MemberView[], accountId: Uint8Array) =>
  people.find((p) => idKey(p.accountId) === idKey(accountId))?.name ?? m.vault_members_unnamed();

type GroupsProps = {
  api: DialogApi;
  session: Session;
  people: () => MemberView[] | undefined;
  store?: VaultStore | undefined;
  exits?: Exits | undefined;
};

const CreateGroup = (props: { busy: boolean; onCreate: (name: string) => void }) => {
  const [name, setName] = createSignal("");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!name().trim()) return;
    props.onCreate(name());
    setName("");
  };
  return (
    <form class={`mt-6 ${panelClass}`} onSubmit={submit}>
      <h2 class={panelTitleClass}>{m.groups_create_title()}</h2>
      <Input
        label={m.groups_create_name()}
        value={name()}
        maxlength={100}
        required
        onInput={(event) => setName(event.currentTarget.value)}
      />
      <Button type="submit" variant="primary" class="w-fit justify-self-end" disabled={props.busy}>
        {m.groups_create()}
      </Button>
    </form>
  );
};

const createGroupsState = (props: GroupsProps) => {
  const client = useQueryClient();
  const vaults = createMemo(() => {
    const shown = props.store?.shown();
    return shown?.state === "ready" ? sharedVaults(shown.vaults, props.session) : [];
  });
  // null for groups that did not load: a query holds a value, never undefined
  const groups = useQuery(() => ({
    queryKey: queryKeys.groups,
    queryFn: async () => (await loadGroups(props.api, props.session)) ?? null,
  }));
  const [links, setLinks] = createSignal<VaultLink[]>([]);
  const [linksVersion, setLinksVersion] = createSignal(0);
  createEffect(
    () => ({ list: vaults(), version: linksVersion() }),
    ({ list }) => {
      if (list.length === 0) {
        setLinks([]);
        return;
      }
      let active = true;
      void loadAllVaultLinks(props.api, props.session, list).then((loaded) => {
        if (active) setLinks(loaded);
      });
      return () => {
        active = false;
      };
    },
  );
  const [changeFailed, setChangeFailed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [pendingLeave, setPendingLeave] = createSignal<PendingLeave>();
  const run = async (change: () => Promise<{ ok: boolean }>) => {
    setBusy(true);
    const result = await change();
    await client.invalidateQueries({ queryKey: queryKeys.groups });
    setLinksVersion((v) => v + 1);
    setChangeFailed(!result.ok);
    setBusy(false);
  };
  const people = () => props.people() ?? [];
  const keeper = () => {
    const id = props.session.opened()?.accountId;
    return mayKeepGroups(people().find((p) => id && idKey(p.accountId) === idKey(id)));
  };
  const startRemove = (group: Group, accountId: Uint8Array) => {
    const loadedGroups = groups.data;
    const me = props.session.opened()?.accountId ?? new Uint8Array();
    const removable =
      loadedGroups && props.store && props.exits
        ? planLeaveAccess(accountId, group.id, loadedGroups, links(), me)
        : [];
    if (removable.length === 0) {
      void run(() => leaveGroup(props.api, props.session, group.id, accountId));
      return;
    }
    setPendingLeave({
      groupId: group.id,
      groupName: group.name,
      accountId,
      personName: nameOf(people(), accountId),
      removable,
    });
  };
  return {
    vaults,
    groups,
    links,
    changeFailed,
    busy,
    pendingLeave,
    setPendingLeave,
    run,
    people,
    keeper,
    startRemove,
  };
};

export const GroupsPage = (props: GroupsProps) => {
  const s = createGroupsState(props);
  return (
    <section aria-labelledby="page-title" class={pageClass("wide")}>
      <h1 id="page-title" class="mb-2 text-[28px] font-semibold md:text-lg">
        {m.nav_groups()}
      </h1>
      <p class={introClass}>{m.groups_intro_real()}</p>
      <Loading>
        <Show when={s.changeFailed() || s.groups.data === null}>
          <p class={alertClass} role="alert">
            {m.groups_failed()}
          </p>
        </Show>
        <Show when={s.groups.data?.length === 0}>
          <p class="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
            {m.groups_empty()}
          </p>
        </Show>
        <ul class="grid gap-3 empty:hidden">
          <For each={s.groups.data ?? []}>
            {(group) => (
              <GroupCard
                group={group}
                people={s.people()}
                vaults={s.vaults()}
                links={linksForGroup(group.id, s.links())}
                keeper={s.keeper()}
                busy={s.busy()}
                onAdd={(person, plan) =>
                  void s.run(() =>
                    joinGroupWithAccess(
                      props.api,
                      props.session,
                      props.store,
                      group.id,
                      person,
                      plan,
                    ),
                  )
                }
                onRemove={(accountId) => s.startRemove(group, accountId)}
                onLink={(vault, role, directGrant) =>
                  void s.run(() =>
                    linkGroupWithAccess(
                      props.api,
                      props.session,
                      props.store,
                      vault,
                      group.id,
                      role,
                      directGrant,
                    ),
                  )
                }
                onUnlink={(vault) =>
                  void s.run(() => unlinkGroup(props.api, props.session, vault, group.id))
                }
                onDelete={() => void s.run(() => deleteGroup(props.api, props.session, group.id))}
              />
            )}
          </For>
        </ul>
      </Loading>
      <Show when={s.pendingLeave()}>
        {(pending) => (
          <LeaveGroupDialog
            pending={pending()}
            busy={s.busy()}
            onCancel={() => s.setPendingLeave(undefined)}
            onConfirm={(removeFrom) => {
              const current = pending();
              s.setPendingLeave(undefined);
              void s.run(() =>
                leaveGroupWithAccess(
                  props.api,
                  props.session,
                  props.store,
                  props.exits,
                  current.groupId,
                  current.accountId,
                  removeFrom,
                ),
              );
            }}
          />
        )}
      </Show>
      <Show when={s.keeper()}>
        <CreateGroup
          busy={s.busy()}
          onCreate={(name) => void s.run(() => createGroup(props.api, props.session, name))}
        />
      </Show>
    </section>
  );
};
