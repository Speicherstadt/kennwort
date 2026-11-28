/**
 * The monthly report (K-603) for owners and admins: once a month, on the security page, how the
 * passwords in the vaults their device opens are doing, as counts per vault. No titles: a title
 * such as „Kündigung Müller“ can say more than the person wants on a screen someone looks over;
 * the lists below have them for whoever acts on them. „Gelesen“ remembers the month in the sealed
 * account state, so every device of the account knows it. Delivery by push or mail comes with
 * K-602 (notifications).
 */
import { Button, m } from "@kennwort/ui";
import { createSignal, For, Show } from "solid-js";
import type { ReportRow } from "./overview.ts";

const cell = "px-2 py-1.5 text-right tabular-nums";

/** "November 2026" in the app's language, from "2026-11" */
export const monthName = (month: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

export const ReportCard = (props: {
  month: string;
  locale: string;
  rows: ReportRow[];
  onSeen: () => Promise<boolean>;
}) => {
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const seen = async () => {
    setBusy(true);
    const saved = await props.onSeen();
    setBusy(false);
    setFailed(!saved);
  };
  return (
    <section
      aria-labelledby="security-report"
      class="grid gap-3 rounded-xl border border-border bg-muted p-3.5"
    >
      <h2 id="security-report" class="text-sm font-semibold">
        {m.security_report_title({ month: monthName(props.month, props.locale) })}
      </h2>
      <p class="text-[13px] text-muted-foreground">{m.security_report_intro()}</p>
      <ul class="grid gap-2 md:hidden">
        <For each={props.rows}>
          {(row) => (
            <li class="grid gap-2 rounded-lg border border-border bg-background p-3 text-[13px]">
              <p class="font-medium">{row.name}</p>
              <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">{m.security_report_entries()}</dt>
                  <dd class="tabular-nums">{row.entries}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">{m.security_weak()}</dt>
                  <dd class="tabular-nums">{row.weak}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">{m.security_reused()}</dt>
                  <dd class="tabular-nums">{row.reused}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">{m.security_leaked()}</dt>
                  <dd class="tabular-nums">{row.leaked ?? m.security_not_checked()}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-muted-foreground">{m.security_marked()}</dt>
                  <dd class="tabular-nums">{row.marked}</dd>
                </div>
              </dl>
            </li>
          )}
        </For>
      </ul>
      <div class="hidden overflow-x-auto md:block" tabindex={0}>
        <table class="w-full min-w-[34rem] text-[13px]">
          <thead class="text-xs text-muted-foreground">
            <tr>
              <th scope="col" class="px-2 py-1.5 text-left font-medium">
                {m.security_report_vault()}
              </th>
              <th scope="col" class={cell}>
                {m.security_report_entries()}
              </th>
              <th scope="col" class={cell}>
                {m.security_weak()}
              </th>
              <th scope="col" class={cell}>
                {m.security_reused()}
              </th>
              <th scope="col" class={cell}>
                {m.security_leaked()}
              </th>
              <th scope="col" class={cell}>
                {m.security_marked()}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <For each={props.rows}>
              {(row) => (
                <tr>
                  <th scope="row" class="px-2 py-1.5 text-left font-normal">
                    {row.name}
                  </th>
                  <td class={cell}>{row.entries}</td>
                  <td class={cell}>{row.weak}</td>
                  <td class={cell}>{row.reused}</td>
                  <td class={cell}>{row.leaked ?? m.security_not_checked()}</td>
                  <td class={cell}>{row.marked}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Show when={failed()}>
        <p role="alert" class="text-[13px] text-danger">
          {m.security_report_save_failed()}
        </p>
      </Show>
      <Button class="w-fit" disabled={busy()} onClick={() => void seen()}>
        {m.security_report_seen()}
      </Button>
    </section>
  );
};
