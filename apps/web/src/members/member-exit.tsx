/**
 * Leaving the company on the members page (K-307 part b, P-11): asking before an owner or admin
 * removes someone, and the exit report for someone who left – per vault the role, the period and
 * every entry they could read with its secret fields, worked out on this device (exitReport) from
 * the vaults it can see. The server never sees the report.
 */
import type { MemberView, ReportVault } from "@kennwort/core";
import { encodeBytes } from "@kennwort/core";
import { Button, Dialog, getLocale, m } from "@kennwort/ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { roleText } from "../vaults/vault-text.ts";

/** What the members page needs of the vaults and entries for leaving */
export type MemberExits = {
  /** After someone left: the vaults load anew, and a manager's client catches up (exit.ts) */
  onLeft: () => Promise<void>;
  /** The exit report for the account, from what this device knows */
  report: (accountId: Uint8Array) => ReportVault[];
  vaultName: (vaultIdText: string) => string;
};

const date = (seconds: number) =>
  new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(seconds * 1000);

export const LeaveDialog = (props: {
  name: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => (
  <Dialog
    open
    onClose={props.onClose}
    title={m.members_leave_of({ name: props.name })}
    description={m.members_leave_text({ name: props.name })}
    variant="destructive"
    size="sm"
    footer={
      <>
        <Button onClick={() => props.onClose()}>{m.ui_cancel()}</Button>
        <Button variant="danger" disabled={props.busy} onClick={() => props.onConfirm()}>
          {props.busy ? m.working() : m.members_leave_confirm()}
        </Button>
      </>
    }
  />
);

const period = (vault: ReportVault) =>
  vault.until === 0
    ? m.report_since({ role: roleText(vault.role), from: date(vault.from) })
    : m.report_period({
        role: roleText(vault.role),
        from: date(vault.from),
        until: date(vault.until),
      });

const ReportEntries = (props: { vault: ReportVault; name: string }) => (
  <Show
    when={props.vault.entries.length > 0}
    fallback={<p class="text-muted-foreground">{m.report_no_entries()}</p>}
  >
    <ul class="divide-y divide-border rounded-lg border border-border" aria-label={props.name}>
      <For each={props.vault.entries}>
        {(entry) => (
          <li class="grid gap-0.5 px-3 py-2">
            <span class="font-medium">{entry.title}</span>
            <span class="text-xs text-muted-foreground">
              {entry.secrets.length > 0
                ? m.report_secrets({ fields: entry.secrets.join(", ") })
                : m.report_no_secrets()}
            </span>
          </li>
        )}
      </For>
    </ul>
  </Show>
);

export const ExitReportDialog = (props: {
  name: string;
  vaults: ReportVault[];
  vaultName: (vaultIdText: string) => string;
  onClose: () => void;
}) => (
  <Dialog
    open
    onClose={props.onClose}
    title={m.members_report_of({ name: props.name })}
    description={m.report_intro()}
    size="lg"
  >
    <Show
      when={props.vaults.length > 0}
      fallback={<p class="text-[13px] text-muted-foreground">{m.report_none()}</p>}
    >
      <ul class="grid max-h-[60vh] gap-4 overflow-auto text-[13px]" aria-label={m.report_vaults()}>
        <For each={props.vaults}>
          {(vault) => (
            <li class="grid gap-1.5">
              <h3 class="font-semibold">{props.vaultName(encodeBytes(vault.vaultId))}</h3>
              <p class="text-xs text-muted-foreground">{period(vault)}</p>
              <ReportEntries vault={vault} name={props.vaultName(encodeBytes(vault.vaultId))} />
            </li>
          )}
        </For>
      </ul>
    </Show>
  </Dialog>
);

/**
 * Whom the page asks about removing and whose exit report shows, and the removal: the server shuts
 * the account out at once, then the vaults load anew and owe a removal and a rotation (exit.ts)
 */
export const createLeaving = (deps: {
  exits: () => MemberExits | undefined;
  leave: (accountId: Uint8Array) => Promise<boolean>;
  busy: () => boolean;
  setBusy: (busy: boolean) => void;
  setProblem: (problem: string | undefined) => void;
  refresh: () => Promise<unknown>;
}) => {
  const [asked, ask] = createSignal<MemberView>();
  const [shown, show] = createSignal<MemberView>();
  /** The report of whom it shows, worked out once each time it opens */
  const report = createMemo(() => {
    const view = shown();
    const exits = deps.exits();
    return view && exits ? exits.report(view.accountId) : [];
  });
  const leave = async (view: MemberView) => {
    deps.setBusy(true);
    deps.setProblem(undefined);
    const left = await deps.leave(view.accountId);
    deps.setBusy(false);
    ask(undefined);
    if (!left) return deps.setProblem(m.members_leave_failed());
    await deps.refresh();
    await deps.exits()?.onLeft();
  };
  return { asked, ask, shown, show, report, leave, exits: deps.exits, busy: deps.busy };
};

const nameOf = (view: MemberView) => view.name ?? m.members_unnamed();

export const ExitDialogs = (props: { leaving: ReturnType<typeof createLeaving> }) => (
  <>
    <Show when={props.leaving.asked()}>
      {(view) => (
        <LeaveDialog
          name={nameOf(view())}
          busy={props.leaving.busy()}
          onConfirm={() => void props.leaving.leave(view())}
          onClose={() => props.leaving.ask(undefined)}
        />
      )}
    </Show>
    <Show when={props.leaving.exits() && props.leaving.shown()}>
      {(view) => (
        <ExitReportDialog
          name={nameOf(view())}
          vaults={props.leaving.report()}
          vaultName={(id) => props.leaving.exits()?.vaultName(id) ?? id}
          onClose={() => props.leaving.show(undefined)}
        />
      )}
    </Show>
  </>
);
