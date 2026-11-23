/**
 * „Sicherheit“ (K-603, docs/sicherheitsdesign.md P-23): counts and lists of weak, reused and
 * leaked passwords and of entries marked „Zum Ändern“, with „Jetzt ändern“ per row; the monthly
 * report for owners and admins; and the switch for the leak check, which is off until this person
 * turns it on. Everything is worked out on the device from the entries it already decrypted.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import {
  Button,
  getLocale,
  introClass,
  m,
  pageClass,
  panelClass,
  panelTitleClass,
} from "@kennwort/ui";
import { createEffect, createMemo, createSignal, Match, Show, Switch } from "solid-js";
import type { Navigation } from "../navigation.ts";
import type { LeakState, Leaks } from "./leaks.ts";
import { type LeakedEntries, overviewOf, reportOf } from "./overview.ts";
import { Counts, ReasonList } from "./security-lists.tsx";
import { ReportCard } from "./security-report.tsx";

export type SecurityDeps = {
  nav: Navigation;
  entries: () => ShownEntry[] | undefined;
  vaultName: (id: string) => string;
  /** Whether this person switched the leak check on (sealed account state) */
  leakCheckOn: () => boolean;
  setLeakCheck: (on: boolean) => Promise<boolean>;
  leaks: Leaks;
  /** The month of a report due for this owner or admin, else undefined */
  reportMonth: () => string | undefined;
  onReportSeen: () => Promise<boolean>;
};

const NONE: LeakedEntries = new Map();
const leakedOf = (state: LeakState) => (state.kind === "done" ? state.leaked : undefined);

const failedText = (state: LeakState) =>
  state.kind !== "failed"
    ? ""
    : state.error === "unavailable"
      ? m.security_leak_unavailable()
      : state.error === "limited"
        ? m.security_leak_limited()
        : m.security_leak_failed();

const LeakSwitch = (props: { deps: SecurityDeps }) => {
  // The choice being saved shows at once; afterwards the sealed account state decides
  const [pending, setPending] = createSignal<boolean>();
  const [failed, setFailed] = createSignal(false);
  const toggle = async (on: boolean) => {
    setPending(on);
    const saved = await props.deps.setLeakCheck(on);
    setPending(undefined);
    setFailed(!saved);
  };
  const state = () => props.deps.leaks.state();
  return (
    <section aria-labelledby="security-leak" class={panelClass}>
      <h2 id="security-leak" class={panelTitleClass}>
        {m.security_leak_title()}
      </h2>
      <label class="flex min-h-11 items-center gap-2 md:min-h-0">
        <input
          type="checkbox"
          checked={pending() ?? props.deps.leakCheckOn()}
          disabled={pending() !== undefined}
          onChange={(event) => void toggle(event.currentTarget.checked)}
        />
        {m.security_leak_toggle()}
      </label>
      <p class="max-w-prose text-[13px] text-muted-foreground">{m.security_leak_explain()}</p>
      <p role="status" class="text-[13px]">
        <Switch>
          <Match when={!props.deps.leakCheckOn()}>{m.security_leak_off()}</Match>
          <Match when={state().kind === "checking"}>{m.security_leak_checking()}</Match>
          <Match when={state().kind === "done"}>{m.security_leak_done()}</Match>
        </Switch>
      </p>
      <Show when={failedText(state())}>
        {(text) => (
          <p role="alert" class="text-[13px] text-danger">
            {text()}
          </p>
        )}
      </Show>
      <Show when={failed()}>
        <p role="alert" class="text-[13px] text-danger">
          {m.security_leak_save_failed()}
        </p>
      </Show>
      <Show when={props.deps.leakCheckOn() && state().kind === "failed"}>
        <Button
          class="w-fit"
          onClick={() => void props.deps.leaks.refresh(props.deps.entries() ?? [], true)}
        >
          {m.security_leak_again()}
        </Button>
      </Show>
    </section>
  );
};

export const SecurityPage = (props: { deps: SecurityDeps }) => {
  // The check runs whenever it is switched on or the entries change; off, it asks nothing
  createEffect(
    () => ({ entries: props.deps.entries() ?? [], on: props.deps.leakCheckOn() }),
    ({ entries, on }) => void props.deps.leaks.refresh(entries, on),
  );
  const leaked = () => leakedOf(props.deps.leaks.state());
  const overview = createMemo(() => overviewOf(props.deps.entries() ?? [], leaked() ?? NONE));
  const leakNote = (entry: ShownEntry) =>
    m.security_leaked_count({ count: leaked()?.get(entry.id) ?? 0 });
  return (
    <section aria-labelledby="page-title" class={pageClass("wide")}>
      <h1 id="page-title" class="mb-1 text-[28px] font-semibold md:text-lg">
        {m.nav_security()}
      </h1>
      <p class={introClass}>{m.security_intro()}</p>
      <div class="grid gap-6">
        <Counts
          weak={overview().weak.length}
          reused={overview().reused.length}
          leaked={leaked() ? overview().leaked.length : undefined}
          marked={overview().marked.length}
        />
        <Show when={props.deps.reportMonth()}>
          {(month) => (
            <ReportCard
              month={month()}
              locale={getLocale()}
              rows={reportOf(props.deps.entries() ?? [], leaked(), props.deps.vaultName)}
              onSeen={props.deps.onReportSeen}
            />
          )}
        </Show>
        <div class="grid gap-6 lg:grid-cols-2">
          <ReasonList
            nav={props.deps.nav}
            id="security-leaked"
            title={m.security_leaked()}
            entries={overview().leaked}
            note={leakNote}
            instead={leaked() ? undefined : m.security_not_checked()}
          />
          <ReasonList
            nav={props.deps.nav}
            id="security-weak"
            title={m.security_weak()}
            entries={overview().weak}
            note={(entry) => entry.subtitle}
          />
          <ReasonList
            nav={props.deps.nav}
            id="security-reused"
            title={m.security_reused()}
            entries={overview().reused}
            note={(entry) => m.security_reused_count({ count: entry.reused })}
          />
          <ReasonList
            nav={props.deps.nav}
            id="security-marked"
            title={m.security_marked()}
            entries={overview().marked}
            note={(entry) => entry.subtitle}
          />
        </div>
        <LeakSwitch deps={props.deps} />
      </div>
    </section>
  );
};
