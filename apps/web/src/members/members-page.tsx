/**
 * Members (K-304): everyone in the company with role and what the client could check. Owners and
 * admins invite here and confirm whom they invited. "Bestätigt" shows only for a certificate the
 * pinned root key confirms (DESIGN.md: show trust, don't claim it). Owners and admins remove
 * someone from the company here, and read the exit report of someone who left (K-307).
 */
import type { MemberView } from "@kennwort/core";
import { encodeBytes } from "@kennwort/core";
import { Badge, Button, Icon, m } from "@kennwort/ui";
import { ShieldCheck } from "@kennwort/ui/icons";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Loading, Match, onSettled, resolve, Show, Switch } from "solid-js";
import { confirmRenewed } from "../account/renew.ts";
import { PolicySection } from "../policy/policy-section.tsx";
import { RecoverySection } from "../policy/recovery-section.tsx";
import { queryKeys } from "../queries.ts";
import type { Opened, Session } from "../session/session.ts";
import { InviteForm } from "./invite-form.tsx";
import { createLeaving, ExitDialogs, type MemberExits } from "./member-exit.tsx";
import {
  adoptRoot,
  type ConfirmError,
  confirm,
  invite,
  type LoadError,
  leaveCompany,
  loadMembers,
  type MembersDeps,
  mayChangeRoles,
  mayConfirm,
  mayInvite,
  mayRemove,
  needsRoot,
  setRole,
} from "./members.ts";
import { RenewedDialog } from "./renewed-dialog.tsx";

const roleText = (role: MemberView["role"]) =>
  ({ owner: m.role_owner(), admin: m.role_admin(), member: m.role_member() })[role];

const confirmText = (error: ConfirmError) =>
  error === "mac-mismatch"
    ? m.members_confirm_mismatch()
    : error === "used"
      ? m.members_confirm_used()
      : error === "other-keys"
        ? m.members_confirm_other_keys()
        : m.members_confirm_failed();

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const Status = (props: {
  view: MemberView;
  canConfirm: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCheck: () => void;
}) => (
  <Switch>
    <Match when={props.view.status === "certified"}>
      <Badge tone="success">
        <Icon icon={ShieldCheck} /> {m.members_certified()}
      </Badge>
    </Match>
    <Match when={props.view.status === "pending" && props.canConfirm}>
      <Button size="sm" class="h-11 md:h-7" disabled={props.busy} onClick={() => props.onConfirm()}>
        {m.members_confirm()}
      </Button>
    </Match>
    <Match when={props.view.status === "renewed" && props.canConfirm}>
      <Button size="sm" class="h-11 md:h-7" disabled={props.busy} onClick={() => props.onCheck()}>
        {m.members_renewed_check()}
      </Button>
    </Match>
    <Match when={props.view.status === "renewed"}>
      <Badge>{m.members_renewed()}</Badge>
    </Match>
    <Match when={props.view.status === "invalid"}>
      <Badge tone="danger">{m.members_invalid()}</Badge>
    </Match>
    <Match when={true}>
      <Badge>{m.members_waiting()}</Badge>
    </Match>
  </Switch>
);

const ROLES = ["owner", "admin", "member"] as const;

/** An owner picks another confirmed member's role; everyone else reads it */
const Role = (props: {
  view: MemberView;
  name: string;
  editable: boolean;
  busy: boolean;
  onRole: (role: MemberView["role"]) => void;
}) => (
  <Show
    when={props.editable}
    fallback={<p class="text-xs text-muted-foreground">{roleText(props.view.role)}</p>}
  >
    <select
      aria-label={m.members_role_of({ name: props.name })}
      class="mt-1 h-11 rounded-md border border-border bg-background px-2 text-xs md:h-7"
      disabled={props.busy}
      value={props.view.role}
      onChange={(event) => props.onRole(event.currentTarget.value as MemberView["role"])}
    >
      <For each={ROLES}>
        {(role) => (
          <option value={role} selected={role === props.view.role}>
            {roleText(role)}
          </option>
        )}
      </For>
    </select>
  </Show>
);

const MemberRow = (props: {
  view: MemberView;
  isMe: boolean;
  canConfirm: boolean;
  canChangeRole: boolean;
  canRemove: boolean;
  /** Whether this device can show an exit report (it has the vaults) */
  reportable: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCheck: () => void;
  onRole: (role: MemberView["role"]) => void;
  onRemove: () => void;
  onReport: () => void;
}) => {
  const name = () => props.view.name ?? (props.isMe ? m.members_you() : m.members_unnamed());
  return (
    <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
      <div class="min-w-0 flex-1">
        <p class="font-medium">
          {name()}
          <Show when={props.isMe && props.view.name}>
            <span class="ml-2 text-xs font-normal text-muted-foreground">{m.members_you()}</span>
          </Show>
        </p>
        <Role
          view={props.view}
          name={name()}
          editable={props.canChangeRole && !props.isMe && props.view.status === "certified"}
          busy={props.busy}
          onRole={props.onRole}
        />
      </div>
      <Show when={props.view.leftAt != null} fallback={<Status {...props} />}>
        <Badge>{m.members_left()}</Badge>
        <Show when={props.reportable}>
          <Button
            size="sm"
            class="h-11 md:h-7"
            aria-label={m.members_report_of({ name: name() })}
            onClick={() => props.onReport()}
          >
            {m.members_report()}
          </Button>
        </Show>
      </Show>
      <Show when={props.canRemove}>
        <Button
          size="sm"
          class="h-11 md:h-7"
          aria-label={m.members_leave_of({ name: name() })}
          disabled={props.busy}
          onClick={() => props.onRemove()}
        >
          {m.members_leave()}
        </Button>
      </Show>
    </li>
  );
};

type Load = Awaited<ReturnType<typeof loadMembers>> | null | undefined;

/** After the first load, an owner or admin without the root key takes one an owner wrapped to it */
const adoptAfter = async (
  firstLoad: Promise<Load>,
  props: { session: Session; api: MembersDeps },
  setProblem: (problem: string) => void,
) => {
  const loaded = await firstLoad;
  const current = props.session.opened();
  if (!current || !loaded?.ok || !needsRoot(current, loaded.value.me)) return;
  const adopted = await adoptRoot(props.api, props.session, loaded.value.me);
  if (adopted.ok || adopted.error === "none") return;
  setProblem(
    adopted.error === "failed" ? m.members_root_adopt_failed() : m.members_root_grant_invalid(),
  );
};

export const MembersPage = (props: {
  session: Session;
  api: MembersDeps;
  origin: string;
  /** Catching up the vaults after someone left, and the exit report; without, neither */
  exits?: MemberExits;
}) => {
  const client = useQueryClient();
  const [busy, setBusy] = createSignal(false);
  const [problem, setProblem] = createSignal<string>();
  /** Whose renewed keys the owner or admin compares now (P-12) */
  const [checking, setChecking] = createSignal<MemberView>();
  const opened = () => props.session.opened();
  /** A right that needs the open account, such as confirming or giving roles */
  const may = (right: (o: Opened, me: MemberView | undefined) => boolean, me?: MemberView) => {
    const current = opened();
    return current !== undefined && right(current, me);
  };
  // The list as the client checked it, errors as values; null while the account is locked. The
  // account is read with the options, so a load uses the state the page shows
  const members = useQuery(() => {
    const current = opened();
    return {
      queryKey: queryKeys.members,
      queryFn: async () => (current ? loadMembers(props.api, current) : null),
    };
  });
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.members });
  const leaving = createLeaving({
    exits: () => props.exits,
    leave: (accountId) => leaveCompany(props.api, props.session, accountId, ready()?.views ?? []),
    busy,
    setBusy,
    setProblem,
    refresh,
  });
  // The first load, taken here: resolve() is a computation of its own, which onSettled may not start
  const firstLoad = resolve(() => members.data);
  // Once on screen; the page lives only while the account is open
  onSettled(() => void adoptAfter(firstLoad, props, setProblem));
  const ready = () => {
    const loaded = members.data;
    return loaded?.ok ? loaded.value : undefined;
  };
  const loadError = (): LoadError | undefined => {
    const loaded = members.data;
    return loaded && !loaded.ok ? loaded.error : undefined;
  };
  /** A change to the list: busy while it runs, its problem shown, then the list anew */
  const act = async (work: () => Promise<string | undefined>) => {
    setBusy(true);
    setProblem(undefined);
    const failed = await work();
    setBusy(false);
    if (failed) setProblem(failed);
    await refresh();
  };
  const doConfirm = (view: MemberView, me: MemberView | undefined) =>
    act(async () => {
      const done = await confirm(props.api, props.session, view, me);
      return done.ok ? undefined : confirmText(done.error);
    });
  const doCheck = (view: MemberView, me: MemberView | undefined) =>
    act(async () => {
      const done = await confirmRenewed(props.api, props.session, view, me?.certificate?.companyId);
      setChecking(undefined);
      if (!done) return m.members_renewed_failed();
      // The vaults load anew: this client signs the rekey and rotation of those it manages
      await props.exits?.onLeft();
      return undefined;
    });
  const doRole = (view: MemberView, role: MemberView["role"]) =>
    act(async () =>
      (await setRole(props.api, props.session, view, role)) ? undefined : m.members_role_failed(),
    );
  const doInvite = (label: string) => {
    const current = opened();
    return current ? invite(props.api, current, label, props.origin) : Promise.resolve(undefined);
  };
  return (
    <section aria-labelledby="page-title" class="min-h-0 flex-1 overflow-auto p-4 md:p-6">
      <h1 id="page-title" class="mb-4 text-[28px] font-semibold md:text-lg">
        {m.members_title()}
      </h1>
      <div class="grid max-w-xl gap-6">
        <Loading>
          <Show when={loadError()}>
            {(error) => (
              <p role="alert" class={alertClass}>
                {error() === "root-mismatch" ? m.members_root_mismatch() : m.members_load_failed()}
              </p>
            )}
          </Show>
          <Show when={ready()}>
            {(list) => (
              <>
                <Show when={mayInvite(list().me)}>
                  <InviteForm onInvite={doInvite} />
                </Show>
                <Show when={problem()}>
                  <p role="alert" class={alertClass}>
                    {problem()}
                  </p>
                </Show>
                <ul
                  class="divide-y divide-border rounded-xl border border-border"
                  aria-label={m.members_title()}
                >
                  <For each={list().views}>
                    {(view) => (
                      <MemberRow
                        view={view}
                        isMe={
                          encodeBytes(view.accountId) ===
                          encodeBytes(opened()?.accountId ?? new Uint8Array())
                        }
                        canConfirm={may(mayConfirm, list().me)}
                        canChangeRole={may(mayChangeRoles, list().me)}
                        canRemove={mayRemove(list().me, view)}
                        reportable={props.exits !== undefined}
                        busy={busy()}
                        onConfirm={() => doConfirm(view, list().me)}
                        onCheck={() => setChecking(view)}
                        onRole={(role) => doRole(view, role)}
                        onRemove={() => leaving.ask(view)}
                        onReport={() => leaving.show(view)}
                      />
                    )}
                  </For>
                </ul>
                <ExitDialogs leaving={leaving} />
                <Show when={checking()}>
                  {(view) => (
                    <RenewedDialog
                      view={view()}
                      name={view().name ?? m.members_unnamed()}
                      busy={busy()}
                      onConfirm={() => void doCheck(view(), list().me)}
                      onClose={() => setChecking(undefined)}
                    />
                  )}
                </Show>
                <PolicySection
                  session={props.session}
                  api={props.api}
                  canEdit={may(mayChangeRoles, list().me)}
                />
                <RecoverySection
                  session={props.session}
                  api={props.api}
                  canEdit={may(mayChangeRoles, list().me)}
                />
              </>
            )}
          </Show>
        </Loading>
      </div>
    </section>
  );
};
