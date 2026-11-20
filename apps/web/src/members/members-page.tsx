/**
 * Members (K-304): everyone in the company with role and what the client could check. Owners and
 * admins invite here and confirm whom they invited. "Bestätigt" shows only for a certificate the
 * pinned root key confirms (DESIGN.md: show trust, don't claim it).
 */
import type { MemberView } from "@kennwort/core";
import { encodeBytes } from "@kennwort/core";
import { Badge, Button, Icon, Input, m } from "@kennwort/ui";
import { Copy, ShieldCheck } from "@kennwort/ui/icons";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import type { Session } from "../session/session.ts";
import {
  type ConfirmError,
  confirm,
  invite,
  type LoadError,
  type Loaded,
  loadMembers,
  type MembersDeps,
  mayConfirm,
  mayInvite,
} from "./members.ts";

type Load =
  | { state: "loading" }
  | { state: "failed"; error: LoadError }
  | ({ state: "ready" } & Loaded);

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

const InviteForm = (props: { onInvite: (label: string) => Promise<string | undefined> }) => {
  const [label, setLabel] = createSignal("");
  const [link, setLink] = createSignal<string>();
  const [failed, setFailed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!label().trim()) return;
    setBusy(true);
    const made = await props.onInvite(label().trim());
    setBusy(false);
    setFailed(!made);
    setLink(made);
    setCopied(false);
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // No clipboard: the link stays in the field to copy by hand
    }
  };
  return (
    <section aria-labelledby="invite-title" class="grid gap-3">
      <h2 id="invite-title" class="text-xs font-medium">
        {m.members_invite_title()}
      </h2>
      <form class="flex flex-wrap items-end gap-2" onSubmit={submit}>
        <div class="min-w-48 flex-1">
          <Input
            label={m.members_invite_name()}
            value={label()}
            maxlength={64}
            required
            onInput={(event) => setLabel(event.currentTarget.value)}
          />
        </div>
        <Button type="submit" variant="primary" class="h-11 md:h-8" disabled={busy()}>
          {busy() ? m.working() : m.members_invite_submit()}
        </Button>
      </form>
      <Show when={failed()}>
        <p role="alert" class={alertClass}>
          {m.members_invite_failed()}
        </p>
      </Show>
      <Show when={link()}>
        {(made) => (
          <div class="grid gap-2">
            <Input
              label={m.members_invite_link()}
              value={made()}
              readonly
              hint={m.members_invite_hint()}
              data-testid="invitation-link"
            />
            <Button class="h-11 w-fit md:h-8" onClick={() => copy(made())}>
              <Icon icon={Copy} /> {copied() ? m.copied() : m.copy()}
            </Button>
          </div>
        )}
      </Show>
    </section>
  );
};

const Status = (props: {
  view: MemberView;
  canConfirm: boolean;
  busy: boolean;
  onConfirm: () => void;
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
    <Match when={props.view.status === "invalid"}>
      <Badge tone="danger">{m.members_invalid()}</Badge>
    </Match>
    <Match when={true}>
      <Badge>{m.members_waiting()}</Badge>
    </Match>
  </Switch>
);

const MemberRow = (props: {
  view: MemberView;
  isMe: boolean;
  canConfirm: boolean;
  busy: boolean;
  onConfirm: () => void;
}) => (
  <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
    <div class="min-w-0 flex-1">
      <p class="font-medium">
        {props.view.name ?? (props.isMe ? m.members_you() : m.members_unnamed())}
        <Show when={props.isMe && props.view.name}>
          <span class="ml-2 text-xs font-normal text-muted-foreground">{m.members_you()}</span>
        </Show>
      </p>
      <p class="text-xs text-muted-foreground">{roleText(props.view.role)}</p>
    </div>
    <Status {...props} />
  </li>
);

export const MembersPage = (props: { session: Session; api: MembersDeps; origin: string }) => {
  const [load, setLoad] = createSignal<Load>({ state: "loading" });
  const [busy, setBusy] = createSignal(false);
  const [problem, setProblem] = createSignal<string>();
  const opened = () => props.session.opened();
  const refresh = async () => {
    const current = opened();
    if (!current) return;
    const loaded = await loadMembers(props.api, current);
    setLoad(
      loaded.ok ? { state: "ready", ...loaded.value } : { state: "failed", error: loaded.error },
    );
  };
  void refresh();
  const ready = () => {
    const value = load();
    return value.state === "ready" ? value : undefined;
  };
  const doConfirm = async (view: MemberView, me: MemberView | undefined) => {
    setBusy(true);
    setProblem(undefined);
    const done = await confirm(props.api, props.session, view, me);
    setBusy(false);
    if (!done.ok) setProblem(confirmText(done.error));
    await refresh();
  };
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
        <Show when={load().state === "failed"}>
          <p role="alert" class={alertClass}>
            {(load() as { error: LoadError }).error === "root-mismatch"
              ? m.members_root_mismatch()
              : m.members_load_failed()}
          </p>
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
                      canConfirm={(() => {
                        const current = opened();
                        return current !== undefined && mayConfirm(current, list().me);
                      })()}
                      busy={busy()}
                      onConfirm={() => doConfirm(view, list().me)}
                    />
                  )}
                </For>
              </ul>
            </>
          )}
        </Show>
      </div>
    </section>
  );
};
