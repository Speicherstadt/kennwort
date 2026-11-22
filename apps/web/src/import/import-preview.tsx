/**
 * The preview of an import and what follows it (K-501): how many entries of each type, the target
 * vault, folders as tags, every entry with title, username and address – never a secret – marked
 * as a duplicate (skipped unless taken anyway) or weak, a code with the login it can go into
 * (K-503 Teil 2); then the progress, and at the end the reminder to delete the export file and
 * the way to „Zum Ändern“.
 */

import type { ImportWrite } from "@kennwort/client/entries/entry-import.ts";
import { typeLabel } from "@kennwort/client/entries/entry-types.ts";
import type { ImportedEntry } from "@kennwort/core";
import { Button, m } from "@kennwort/ui";
import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js";
import { Choice } from "../entries/choice.tsx";
import { Link } from "../frame/link.tsx";
import type { Navigation } from "../navigation.ts";
import { chipClass, Row } from "./import-row.tsx";
import { Alert } from "./import-steps.tsx";
import {
  type Comparable,
  contentsToImport,
  countByType,
  previewRows,
  targetOf,
} from "./preview.ts";
import type { ImportOutcome } from "./run.ts";

export type TargetVault = { idText: string; name: string };

export const PreviewStep = (props: {
  entries: ImportedEntry[];
  /** Codes of an authenticator's export Kennwort leaves out (HOTP, Steam; K-503) */
  unsupported: number;
  /** Passkeys of a CXF file whose keys Kennwort cannot keep (not ES256; K-502 Teil 5) */
  passkeysLeftOut: number;
  vaults: TargetVault[];
  existing: (vaultIdText: string) => Comparable[];
  /** Missing while nothing may be written (offline) */
  canWrite: boolean;
  onImport: (vaultIdText: string, writes: ImportWrite[], weak: number) => void;
  onBack: () => void;
}) => {
  const id = createUniqueId();
  // Unset until chosen, so the first vault shows even when the vaults arrive later
  const [chosenVault, setVault] = createSignal<string>();
  const vault = () => chosenVault() ?? props.vaults[0]?.idText ?? "";
  const [foldersAsTags, setFoldersAsTags] = createSignal(false);
  const [take, setTake] = createSignal<ReadonlySet<number>>(new Set());
  const [targets, setTargets] = createSignal<ReadonlyMap<number, string>>(new Map());
  const rows = createMemo(() => previewRows(props.entries, props.existing(vault())));
  const chosen = () =>
    contentsToImport(props.entries, rows(), {
      take: take(),
      foldersAsTags: foldersAsTags(),
      targets: targets(),
    });
  const codesAdded = () => chosen().filter((w) => w.kind === "code").length;
  const skipped = () => rows().filter((r) => r.duplicate && !take().has(r.index)).length;
  const weak = () => rows().filter((r) => r.weak && (!r.duplicate || take().has(r.index))).length;
  const toggle = (index: number, on: boolean) => {
    const next = new Set(take());
    if (on) next.add(index);
    else next.delete(index);
    setTake(next);
  };
  const putCode = (index: number, target: string) =>
    setTargets(new Map(targets()).set(index, target));
  return (
    <div class="grid gap-4">
      <h2 class="font-semibold">{m.import_preview_title()}</h2>
      <p>{m.import_found({ count: props.entries.length })}</p>
      <ul aria-label={m.import_types()} class="flex flex-wrap gap-1.5">
        <For each={countByType(props.entries)}>
          {([type, count]) => (
            <li class={chipClass}>{m.import_type_count({ type: typeLabel(type), count })}</li>
          )}
        </For>
      </ul>
      <Show when={props.vaults.length > 0} fallback={<Alert text={m.import_no_vault()} />}>
        <div class="grid max-w-md gap-3">
          <Choice
            label={m.import_vault()}
            value={vault()}
            options={props.vaults.map((v) => ({ value: v.idText, label: v.name }))}
            onChange={setVault}
          />
          <label for={`${id}-tags`} class="flex min-h-11 items-center gap-2 md:min-h-0">
            <input
              id={`${id}-tags`}
              type="checkbox"
              checked={foldersAsTags()}
              onChange={(event) => setFoldersAsTags(event.currentTarget.checked)}
            />
            {m.import_folders_as_tags()}
          </label>
        </div>
      </Show>
      <Show when={props.unsupported > 0}>
        <p class="text-[13px] text-warning">{m.import_unsupported({ count: props.unsupported })}</p>
      </Show>
      <Show when={props.passkeysLeftOut > 0}>
        <p class="text-[13px] text-warning">
          {m.import_passkeys_left_out({ count: props.passkeysLeftOut })}
        </p>
      </Show>
      <Show when={skipped() > 0}>
        <p class="text-[13px]">{m.import_duplicates({ count: skipped() })}</p>
      </Show>
      <Show when={codesAdded() > 0}>
        <p class="text-[13px]">{m.import_codes_added({ count: codesAdded() })}</p>
      </Show>
      <Show when={weak() > 0}>
        <p class="text-[13px] text-warning">{m.import_weak_found({ count: weak() })}</p>
      </Show>
      <Show when={!props.canWrite}>
        <Alert text={m.import_offline()} />
      </Show>
      <div class="flex flex-wrap gap-2">
        <Button onClick={() => props.onBack()}>{m.import_back()}</Button>
        <Button
          variant="primary"
          disabled={!props.canWrite || props.vaults.length === 0 || chosen().length === 0}
          onClick={() => props.onImport(vault(), chosen(), weak())}
        >
          {m.import_start({ count: chosen().length })}
        </Button>
      </div>
      <ul
        aria-label={m.import_list()}
        class="divide-y divide-border rounded-xl border border-border"
      >
        <For each={rows()}>
          {(row) => (
            <Row
              row={row}
              taken={take().has(row.index)}
              onTake={(on) => toggle(row.index, on)}
              target={targetOf(row, targets())}
              onTarget={(target) => putCode(row.index, target)}
            />
          )}
        </For>
      </ul>
    </div>
  );
};

export const ProgressStep = (props: { done: number; total: number }) => (
  <div class="grid max-w-md gap-2">
    <progress class="w-full" max={props.total} value={props.done} aria-label={m.import_title()} />
    <p role="status">{m.import_progress({ done: props.done, total: props.total })}</p>
  </div>
);

const stoppedText = (outcome: ImportOutcome) =>
  outcome.error === undefined
    ? undefined
    : outcome.error === "rotation-due"
      ? m.import_stopped_rotation()
      : outcome.error === "read-only"
        ? m.import_stopped_read_only()
        : m.import_stopped_failed();

export const DoneStep = (props: {
  nav: Navigation;
  outcome: ImportOutcome;
  weak: number;
  onAgain: () => void;
}) => (
  <div class="grid max-w-xl gap-4">
    <h2 class="font-semibold">{m.import_done_title()}</h2>
    <p role="status">{m.import_done({ count: props.outcome.imported })}</p>
    <Show when={props.outcome.unsaved > 0 && props.outcome.error === undefined}>
      <p class="text-[13px] text-danger">{m.import_unsaved({ count: props.outcome.unsaved })}</p>
    </Show>
    <Alert text={stoppedText(props.outcome)} />
    <p
      role="note"
      class="rounded-lg border border-warning bg-warning-surface px-3 py-2 text-[13px] text-warning"
    >
      {m.import_delete_file()}
    </p>
    <Show when={props.weak > 0 && props.outcome.imported > 0}>
      <Link nav={props.nav} href="/to-change" class="w-fit underline">
        {m.import_to_change()}
      </Link>
    </Show>
    <Button class="w-fit" onClick={() => props.onAgain()}>
      {m.import_again()}
    </Button>
  </div>
);
