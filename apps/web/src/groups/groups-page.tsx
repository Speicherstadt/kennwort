/**
 * Groups (K-305 part 5): master-detail team view. Left lists the company's groups; right shows the
 * selected group's vaults and members as clean toggles (no dropdown walls). Verified members are
 * granted directly on vaults this device manages; removing a member offers vault removal & key
 * rotation via LeaveGroupDialog.
 */

import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { idKey, type MemberView, type VaultRole } from "@kennwort/core";
import { Button, cn, Dialog, Icon, Input, m, pageClass } from "@kennwort/ui";
import { Plus } from "@kennwort/ui/icons";
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
  planJoinAccess,
  planLeaveAccess,
  planLinkAccess,
  sharedVaults,
  type VaultLink,
} from "./group-access.ts";
import { GroupDetail } from "./group-detail.tsx";
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

const alertClass = "mb-4 rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const nameOf = (people: readonly MemberView[], accountId: Uint8Array) =>
  people.find((p) => idKey(p.accountId) === idKey(accountId))?.name ?? m.vault_members_unnamed();

type GroupsProps = {
  api: DialogApi;
  session: Session;
  people: () => MemberView[] | undefined;
  store?: VaultStore | undefined;
  exits?: Exits | undefined;
  initialGroupId?: string | undefined;
};

const CreateGroupDialog = (props: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) => {
  const [name, setName] = createSignal("");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!name().trim()) return;
    props.onCreate(name());
    setName("");
    props.onClose();
  };
  return (
    <Dialog open={props.open} onClose={props.onClose} title={m.groups_create_title()}>
      <form class="grid gap-4" onSubmit={submit}>
        <Input
          label={m.groups_create_name()}
          value={name()}
          maxlength={100}
          required
          onInput={(event) => setName(event.currentTarget.value)}
        />
        <div class="flex justify-end gap-2">
          <Button type="button" disabled={props.busy} onClick={props.onClose}>
            {m.groups_leave_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={props.busy || !name().trim()}>
            {m.groups_create()}
          </Button>
        </div>
      </form>
    </Dialog>
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
  const [selectedId, setSelectedId] = createSignal<string>();
  const [creating, setCreating] = createSignal(false);
  const [feedback, setFeedback] = createSignal<string>();
  const [changeFailed, setChangeFailed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [pendingLeave, setPendingLeave] = createSignal<PendingLeave>();
  const activeGroup = createMemo(() => {
    const list = groups.data ?? [];
    const wanted = selectedId() ?? props.initialGroupId;
    return list.find((g) => g.id === wanted) ?? list[0];
  });
  const run = async (change: () => Promise<{ ok: boolean }>, note?: string) => {
    setBusy(true);
    const result = await change();
    await client.invalidateQueries({ queryKey: queryKeys.groups });
    setLinksVersion((v) => v + 1);
    setChangeFailed(!result.ok);
    setFeedback(result.ok ? note : undefined);
    setBusy(false);
  };
  const people = () => props.people() ?? [];
  const keeper = () => {
    const id = props.session.opened()?.accountId;
    return mayKeepGroups(people().find((p) => id && idKey(p.accountId) === idKey(id)));
  };
  const toggleVault = (group: Group, vault: Vault, checked: boolean) => {
    const vName = vault.name ?? m.vaults_unnamed();
    if (!checked) {
      void run(
        () => unlinkGroup(props.api, props.session, vault, group.id),
        m.groups_feedback_vault_off({ vault: vName, group: group.name }),
      );
      return;
    }
    const plan = planLinkAccess(group, vault, people());
    const note =
      plan.directGrant.length > 0
        ? m.groups_feedback_vault_on({ vault: vName, count: plan.directGrant.length })
        : m.groups_feedback_vault_linked({ vault: vName, group: group.name });
    void run(
      () =>
        linkGroupWithAccess(
          props.api,
          props.session,
          props.store,
          vault,
          group.id,
          "read",
          plan.directGrant,
        ),
      note,
    );
  };
  const changeVaultRole = (group: Group, vault: Vault, role: VaultRole) => {
    const plan = planLinkAccess(group, vault, people());
    void run(() =>
      linkGroupWithAccess(
        props.api,
        props.session,
        props.store,
        vault,
        group.id,
        role,
        plan.directGrant,
      ),
    );
  };
  const toggleMember = (group: Group, person: MemberView, checked: boolean) => {
    const pName = person.name ?? m.vault_members_unnamed();
    if (checked) {
      const plan = planJoinAccess(person, group.id, links());
      const note =
        plan.directGrant.length > 0
          ? m.groups_feedback_member_granted({
              name: pName,
              vaults: plan.directGrant.map((d) => d.vault.name ?? m.vaults_unnamed()).join(", "),
            })
          : m.groups_feedback_member_on({ name: pName, group: group.name });
      void run(
        () => joinGroupWithAccess(props.api, props.session, props.store, group.id, person, plan),
        note,
      );
      return;
    }
    const loadedGroups = groups.data;
    const me = props.session.opened()?.accountId ?? new Uint8Array();
    const removable =
      loadedGroups && props.store && props.exits
        ? planLeaveAccess(person.accountId, group.id, loadedGroups, links(), me)
        : [];
    if (removable.length === 0) {
      void run(
        () => leaveGroup(props.api, props.session, group.id, person.accountId),
        m.groups_feedback_member_off({ name: pName, group: group.name }),
      );
      return;
    }
    setPendingLeave({
      groupId: group.id,
      groupName: group.name,
      accountId: person.accountId,
      personName: nameOf(people(), person.accountId),
      removable,
    });
  };
  return {
    vaults,
    groups,
    links,
    activeGroup,
    setSelectedId,
    creating,
    setCreating,
    feedback,
    setFeedback,
    changeFailed,
    busy,
    pendingLeave,
    setPendingLeave,
    run,
    people,
    keeper,
    toggleVault,
    changeVaultRole,
    toggleMember,
  };
};

export const GroupsPage = (props: GroupsProps) => {
  const s = createGroupsState(props);
  return (
    <section aria-labelledby="page-title" class={pageClass("wide")}>
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="page-title" class="text-[28px] font-semibold md:text-lg">
            {m.nav_groups()}
          </h1>
          <p class="mt-1 text-[13px] text-muted-foreground">{m.groups_intro_real()}</p>
        </div>
        <Show when={s.keeper()}>
          <Button variant="primary" disabled={s.busy()} onClick={() => s.setCreating(true)}>
            <Icon icon={Plus} /> {m.groups_create_title()}
          </Button>
        </Show>
      </div>
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
        <Show when={s.activeGroup()}>
          {(current) => (
            <div class="grid gap-4 md:grid-cols-[220px_1fr]">
              <ul class="space-y-1" aria-label={m.nav_groups()}>
                <For each={s.groups.data ?? []}>
                  {(group) => {
                    const active = () => current().id === group.id;
                    const vCount = () => linksForGroup(group.id, s.links()).length;
                    return (
                      <li>
                        <button
                          type="button"
                          aria-current={active() ? "true" : undefined}
                          class={cn(
                            "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors",
                            active()
                              ? "border-foreground bg-card font-medium"
                              : "border-transparent text-muted-foreground hover:border-border hover:bg-card/60 hover:text-foreground",
                          )}
                          onClick={() => {
                            s.setSelectedId(group.id);
                            s.setFeedback(undefined);
                          }}
                        >
                          <span class="truncate text-xs">{group.name}</span>
                          <span class="shrink-0 text-xs text-muted-foreground">
                            {vCount()}T · {group.members.length}P
                          </span>
                        </button>
                      </li>
                    );
                  }}
                </For>
              </ul>
              <GroupDetail
                group={current()}
                vaults={s.vaults()}
                links={linksForGroup(current().id, s.links())}
                people={s.people()}
                keeper={s.keeper()}
                busy={s.busy()}
                feedback={s.feedback()}
                onToggleVault={(vault, checked) => s.toggleVault(current(), vault, checked)}
                onVaultRole={(vault, role) => s.changeVaultRole(current(), vault, role)}
                onToggleMember={(person, checked) => s.toggleMember(current(), person, checked)}
                onDelete={() =>
                  void s.run(() => deleteGroup(props.api, props.session, current().id))
                }
              />
            </div>
          )}
        </Show>
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
              void s.run(
                () =>
                  leaveGroupWithAccess(
                    props.api,
                    props.session,
                    props.store,
                    props.exits,
                    current.groupId,
                    current.accountId,
                    removeFrom,
                  ),
                m.groups_feedback_member_off({
                  name: current.personName,
                  group: current.groupName,
                }),
              );
            }}
          />
        )}
      </Show>
      <CreateGroupDialog
        open={s.creating()}
        busy={s.busy()}
        onClose={() => s.setCreating(false)}
        onCreate={(name) => void s.run(() => createGroup(props.api, props.session, name))}
      />
    </section>
  );
};
