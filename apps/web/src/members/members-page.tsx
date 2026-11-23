/**
 * Members (K-304): everyone in the company with role and what the client could check. Owners and
 * admins invite here and confirm whom they invited. "Bestätigt" shows only for a certificate the
 * pinned root key confirms (DESIGN.md: show trust, don't claim it). Owners and admins remove
 * someone from the company here, and read the exit report of someone who left (K-307).
 */
import type { MemberView } from "@kennwort/core";
import { encodeBytes } from "@kennwort/core";
import {
  Badge,
  Button,
  cn,
  Icon,
  introClass,
  m,
  pageClass,
  selectClass,
  TooltipIconButton,
} from "@kennwort/ui";
import { ShieldCheck, UserMinus } from "@kennwort/ui/icons";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Loading, Match, onSettled, resolve, Show, Switch } from "solid-js";
import { queryKeys } from "../queries.ts";
import type { Opened, Session } from "../session/session.ts";
import { InviteForm } from "./invite-form.tsx";
import { createLeaving, ExitDialogs, type MemberExits } from "./member-exit.tsx";
import {
  adoptRoot,
  type ConfirmError,
  confirm,
  invite,
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
import { CompanySections, type Load, LoadProblem, refreshAfterRoot } from "./members-load.tsx";
import { createRenewedCheck, RenewedCheck } from "./renewed-dialog.tsx";

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
  isMe: boolean;
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
    <Match when={props.view.status === "enrolled" && (props.canConfirm || props.isMe)}>
      <Button size="sm" class="h-11 md:h-7" disabled={props.busy} onClick={() => props.onCheck()}>
        {props.isMe ? m.oidc_waiting_own() : m.members_enrolled_check()}
      </Button>
    </Match>
    <Match when={props.view.status === "enrolled"}>
      <Badge>{m.members_enrolled()}</Badge>
    </Match>
    <Match when={props.view.status === "former"}>
      <Badge>{m.members_former()}</Badge>
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
    fallback={<p class="px-3 text-[13px] text-muted-foreground">{roleText(props.view.role)}</p>}
  >
    <select
      aria-label={m.members_role_of({ name: props.name })}
      class={cn(selectClass, "w-full")}
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
    <li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span
        aria-hidden="true"
        class="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-medium"
      >
        {name().slice(0, 1).toUpperCase()}
      </span>
      <div class="grid min-w-0 flex-1 gap-1">
        <p class="truncate font-medium">
          {name()}
          <Show when={props.isMe && props.view.name}>
            <span class="ml-2 text-xs font-normal text-muted-foreground">{m.members_you()}</span>
          </Show>
        </p>
        <div class="flex flex-wrap items-center gap-2 empty:hidden">
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
        </div>
      </div>
      {/* One column for the role, so every row lines up whether it is editable or not */}
      <div class="w-36 shrink-0">
        <Role
          view={props.view}
          name={name()}
          editable={props.canChangeRole && !props.isMe && props.view.status === "certified"}
          busy={props.busy}
          onRole={props.onRole}
        />
      </div>
      <Show
        when={props.canRemove}
        fallback={<span aria-hidden="true" class="size-11 shrink-0 md:size-8" />}
      >
        <TooltipIconButton
          label={m.members_leave_of({ name: name() })}
          class="size-11 shrink-0 text-muted-foreground hover:text-danger md:size-8"
          disabled={props.busy}
          onClick={() => props.onRemove()}
        >
          <Icon icon={UserMinus} />
        </TooltipIconButton>
      </Show>
    </li>
  );
};

/** An invitation link from the open account, none while it is locked */
const inviting =
  (props: { session: Session; api: MembersDeps; origin: string }) => (label: string) => {
    const current = props.session.opened();
    return current ? invite(props.api, current, label, props.origin) : Promise.resolve(undefined);
  };

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
  const afterRoot = refreshAfterRoot(client);
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
  const renewal = createRenewedCheck(props, act);
  const doRole = (view: MemberView, role: MemberView["role"]) =>
    act(async () =>
      (await setRole(props.api, props.session, view, role)) ? undefined : m.members_role_failed(),
    );
  return (
    <section aria-labelledby="page-title" class={pageClass("wide")}>
      <h1 id="page-title" class="mb-1 text-[28px] font-semibold md:text-lg">
        {m.members_title()}
      </h1>
      <p class={introClass}>{m.members_intro()}</p>
      <div class="grid gap-6">
        <Loading>
          <LoadProblem
            loaded={members.data}
            session={props.session}
            api={props.api}
            onRoot={afterRoot}
          />
          <Show when={ready()}>
            {(list) => (
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
                <div class="grid content-start gap-6">
                  <Show when={mayInvite(list().me)}>
                    <InviteForm onInvite={inviting(props)} />
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
                          onCheck={() => renewal.ask(view)}
                          onRole={(role) => doRole(view, role)}
                          onRemove={() => leaving.ask(view)}
                          onReport={() => leaving.show(view)}
                        />
                      )}
                    </For>
                  </ul>
                </div>
                <ExitDialogs leaving={leaving} />
                <RenewedCheck check={renewal} me={list().me} session={props.session} />
                <div class="grid content-start gap-4">
                  <CompanySections
                    session={props.session}
                    api={props.api}
                    canEdit={may(mayChangeRoles, list().me)}
                    onRoot={afterRoot}
                  />
                </div>
              </div>
            )}
          </Show>
        </Loading>
      </div>
    </section>
  );
};
