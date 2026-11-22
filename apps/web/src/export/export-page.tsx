/**
 * The page „Exportieren“ (K-504): what (a vault or all), the format, the passphrase for JSON and
 * KDBX or, for CSV, the confirmation that the file is plain text. The passphrase is read from its
 * fields when the form is sent and the form is reset at once, so the page keeps it no longer than
 * the file takes to make; the file itself goes straight to a download (export.ts).
 */
import type { ExportFormat, ExportScope } from "@kennwort/core";
import { Button, Input, m, selectClass } from "@kennwort/ui";
import { createSignal, createUniqueId, For, Match, Show, Switch } from "solid-js";
import { Alert } from "../import/import-steps.tsx";
import { type ExportDeps, type ExportOutcome, MIN_PASSPHRASE, runExport } from "./export.ts";

export type ExportPageDeps = ExportDeps & {
  /** Only owners and admins export; the page says so to anyone else */
  allowed: () => boolean;
};

const FORMATS: { format: ExportFormat; label: () => string; hint: () => string }[] = [
  { format: "kennwort-json", label: m.export_format_json, hint: m.export_format_json_hint },
  { format: "kdbx", label: m.export_format_kdbx, hint: m.export_format_kdbx_hint },
  { format: "csv", label: m.export_format_csv, hint: m.export_format_csv_hint },
];

const ALL = "all";
const scopeOf = (value: string): ExportScope =>
  value === ALL ? { kind: "all" } : { kind: "vault", vaultId: value };

type State =
  | { state: "form"; error?: string | undefined }
  | { state: "busy" }
  | { state: "done"; count: number; name: string; csv: boolean };

/** Why the passphrase fields do not do, if they do not */
const passphraseError = (passphrase: string, repeated: string) => {
  if (passphrase.length < MIN_PASSPHRASE)
    return m.export_passphrase_short({ count: MIN_PASSPHRASE });
  return passphrase === repeated ? undefined : m.export_passphrase_mismatch();
};

const ERROR_TEXT = {
  empty: () => m.export_error_empty(),
  refused: () => m.export_error_refused(),
  failed: () => m.export_error_failed(),
};

const outcomeState = (outcome: ExportOutcome, csv: boolean): State =>
  outcome.ok
    ? { state: "done", count: outcome.count, name: outcome.name, csv }
    : {
        state: "form",
        error: ERROR_TEXT[outcome.error](),
      };

const CsvWarning = () => (
  <p role="note" class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger">
    {m.export_csv_warning()}
  </p>
);

const FormatChoice = (props: { value: ExportFormat; onChange: (format: ExportFormat) => void }) => {
  const id = createUniqueId();
  return (
    <fieldset class="grid gap-2">
      <legend class="mb-1 text-xs font-medium">{m.export_format()}</legend>
      <For each={FORMATS}>
        {(choice) => (
          <label class="flex min-h-11 items-start gap-2 md:min-h-0">
            <input
              type="radio"
              name={`${id}-format`}
              value={choice.format}
              checked={props.value === choice.format}
              onChange={() => props.onChange(choice.format)}
              class="mt-1"
            />
            <span class="grid">
              <span class="text-[13px] font-medium">{choice.label()}</span>
              <span class="text-xs text-muted-foreground">{choice.hint()}</span>
            </span>
          </label>
        )}
      </For>
    </fieldset>
  );
};

/** What the form chose; kept by the page, so an error does not reset it */
type Choice = {
  format: () => ExportFormat;
  setFormat: (format: ExportFormat) => void;
  scope: () => string;
  setScope: (scope: string) => void;
};

const ExportForm = (props: {
  deps: ExportPageDeps;
  choice: Choice;
  onState: (state: State) => void;
  error?: string | undefined;
}) => {
  const id = createUniqueId();
  const { format, setFormat, scope, setScope } = props.choice;
  const [missing, setMissing] = createSignal<string>();
  const csv = () => format() === "csv";
  const submit = async (form: HTMLFormElement) => {
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null;
    const passphrase = field("passphrase")?.value ?? "";
    const repeated = field("passphrase-repeat")?.value ?? "";
    const problem = csv()
      ? field("plain-text")?.checked
        ? undefined
        : m.export_csv_confirm_missing()
      : passphraseError(passphrase, repeated);
    // The fields let go of the passphrase at once: the request is all the export keeps
    form.reset();
    if (problem) return setMissing(problem);
    const chosen = format();
    props.onState({ state: "busy" });
    const outcome = await runExport(props.deps, {
      format: chosen,
      scope: scopeOf(scope()),
      passphrase,
    });
    props.onState(outcomeState(outcome, chosen === "csv"));
  };
  return (
    <form
      class="grid max-w-xl gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setMissing(undefined);
        void submit(event.currentTarget);
      }}
    >
      <div class="grid gap-1.5">
        <label for={`${id}-scope`} class="text-xs font-medium">
          {m.export_scope()}
        </label>
        <select
          id={`${id}-scope`}
          class={selectClass}
          value={scope()}
          onChange={(event) => setScope(event.currentTarget.value)}
        >
          <option value={ALL}>{m.export_scope_all()}</option>
          <For each={props.deps.vaults()}>
            {(vault) => <option value={vault.idText}>{vault.name}</option>}
          </For>
        </select>
      </div>
      <FormatChoice value={format()} onChange={setFormat} />
      <Show
        when={csv()}
        fallback={
          <div class="grid gap-3">
            <Input
              name="passphrase"
              label={m.export_passphrase()}
              hint={m.export_passphrase_hint({ count: MIN_PASSPHRASE })}
              type="password"
              autocomplete="new-password"
            />
            <Input
              name="passphrase-repeat"
              label={m.export_passphrase_repeat()}
              type="password"
              autocomplete="new-password"
            />
          </div>
        }
      >
        <CsvWarning />
        <label class="flex min-h-11 items-center gap-2 text-[13px] md:min-h-0">
          <input type="checkbox" name="plain-text" />
          {m.export_csv_confirm()}
        </label>
      </Show>
      <p class="text-xs text-muted-foreground">{m.export_audit_hint()}</p>
      <Alert text={missing() ?? props.error} />
      <Button type="submit" variant="primary" class="w-fit">
        {m.export_start()}
      </Button>
    </form>
  );
};

const DoneStep = (props: { count: number; name: string; csv: boolean; onAgain: () => void }) => (
  <div class="grid max-w-xl gap-4" role="status">
    <h2 class="font-semibold">{m.export_done_title()}</h2>
    <p>{m.export_done({ count: props.count, name: props.name })}</p>
    <p
      role="note"
      class="rounded-lg border border-warning bg-warning-surface px-3 py-2 text-[13px] text-warning"
    >
      {props.csv ? m.export_done_csv() : m.export_done_keep()}
    </p>
    <Button class="w-fit" onClick={() => props.onAgain()}>
      {m.export_again()}
    </Button>
  </div>
);

export const ExportPage = (props: { deps: ExportPageDeps }) => {
  const [state, setState] = createSignal<State>({ state: "form" });
  const [format, setFormat] = createSignal<ExportFormat>("kennwort-json");
  const [scope, setScope] = createSignal(ALL);
  const choice = { format, setFormat, scope, setScope };
  return (
    <section aria-labelledby="page-title" class="min-h-0 flex-1 overflow-auto p-4 md:p-6">
      <h1 id="page-title" class="mb-2 text-[28px] font-semibold md:text-lg">
        {m.export_title()}
      </h1>
      <Show when={props.deps.allowed()} fallback={<p class="max-w-xl">{m.export_not_allowed()}</p>}>
        <p class="mb-4 max-w-xl text-muted-foreground">{m.export_intro()}</p>
        <Switch>
          <Match when={state().state === "busy"}>
            <p role="status" class="text-[13px]">
              {m.export_busy()}
            </p>
          </Match>
          <Match
            when={(() => {
              const s = state();
              return s.state === "done" ? s : undefined;
            })()}
          >
            {(done) => (
              <DoneStep
                count={done().count}
                name={done().name}
                csv={done().csv}
                onAgain={() => setState({ state: "form" })}
              />
            )}
          </Match>
          <Match
            when={(() => {
              const s = state();
              return s.state === "form" ? s : undefined;
            })()}
          >
            {(form) => (
              <ExportForm
                deps={props.deps}
                choice={choice}
                onState={setState}
                error={form().error}
              />
            )}
          </Match>
        </Switch>
      </Show>
    </section>
  );
};
