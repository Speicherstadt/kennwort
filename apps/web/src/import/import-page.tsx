/**
 * „Importieren“ (K-501): choose the vendor, read where its export is, pick the file, map a table's
 * columns, check the preview, import into a vault, then delete the file. The file is read and
 * parsed on the device only (docs/plan.md, Import und Export). The plaintext lives in this page's
 * state while the mapping or the preview needs it and no longer: the import's end keeps only
 * counts, and leaving the page drops the rest. The file's bytes are zeroed once parsed; strings
 * JavaScript cannot wipe, so they wait for the garbage collector like every decrypted entry.
 */
import {
  type Columns,
  csvColumns,
  type EntryContent,
  type ImportedEntry,
  type ImportResult,
} from "@kennwort/core";
import { m } from "@kennwort/ui";
import { createSignal, Match, onCleanup, Switch } from "solid-js";
import type { Navigation } from "../navigation.ts";
import { DoneStep, PreviewStep, ProgressStep, type TargetVault } from "./import-preview.tsx";
import { FileStep, MapStep, VendorStep } from "./import-steps.tsx";
import type { Comparable } from "./preview.ts";
import { errorText, guessColumns, parseChoice } from "./read-file.ts";
import { type ImportOutcome, runImport, type SaveBatch } from "./run.ts";
import { type VendorChoice, vendorChoices } from "./vendors.ts";

export type ImportDeps = {
  /** The vaults this account may write in now: no reader's, none with a rotation due (P-11) */
  vaults: () => TargetVault[];
  /** What the vault's entries are compared by for duplicates */
  existing: (vaultIdText: string) => Comparable[];
  /** Writes a batch through the entry store; missing while offline */
  save: () => ((vaultIdText: string, batch: EntryContent[]) => ReturnType<SaveBatch>) | undefined;
};

type Step =
  | { step: "vendor" }
  | { step: "file"; choice: VendorChoice; busy?: boolean; error?: string }
  | {
      step: "map";
      choice: VendorChoice;
      bytes: Uint8Array;
      columns: string[];
      mapping: Columns;
      error?: string | undefined;
    }
  | { step: "preview"; entries: ImportedEntry[] }
  | { step: "importing"; done: number; total: number }
  | { step: "done"; outcome: ImportOutcome; weak: number };

/** The step if it is this one, for a Match */
const at = <K extends Step["step"]>(step: Step, kind: K) =>
  step.step === kind ? (step as Extract<Step, { step: K }>) : undefined;

const readBytes = (file: File) =>
  file.arrayBuffer().then(
    (buffer) => new Uint8Array(buffer),
    () => undefined,
  );

/** The steps and what moves between them; the save is read when the import starts */
const createImportFlow = (save: ImportDeps["save"]) => {
  const [step, setStep] = createSignal<Step>({ step: "vendor" });

  /** The parsed entries to the preview, or the error back to the file step */
  const parsed = (choice: VendorChoice, result: ImportResult) =>
    setStep(
      result.ok
        ? { step: "preview", entries: result.value }
        : { step: "file", choice, error: errorText(result.error) },
    );

  const onFile = async (choice: VendorChoice, file: File) => {
    setStep({ step: "file", choice, busy: true });
    const bytes = await readBytes(file);
    if (!bytes) return setStep({ step: "file", choice, error: m.import_error_unreadable() });
    if (choice.format) {
      const result = parseChoice(choice, bytes);
      bytes.fill(0);
      return parsed(choice, result);
    }
    const columns = csvColumns(bytes);
    if (!columns.ok) {
      bytes.fill(0);
      return setStep({ step: "file", choice, error: errorText(columns.error) });
    }
    setStep({
      step: "map",
      choice,
      bytes,
      columns: columns.value,
      mapping: guessColumns(columns.value),
    });
  };

  const onMapped = (map: Extract<Step, { step: "map" }>) => {
    if (Object.keys(map.mapping).length === 0)
      return setStep({ ...map, error: m.import_map_empty() });
    const result = parseChoice(map.choice, map.bytes, map.mapping);
    if (!result.ok) return setStep({ ...map, error: errorText(result.error) });
    map.bytes.fill(0);
    parsed(map.choice, result);
  };

  /** The bytes of a table still being mapped, overwritten before they are let go */
  const dropBytes = () => {
    const now = step();
    if (now.step === "map") now.bytes.fill(0);
  };

  const backToVendor = () => {
    dropBytes();
    setStep({ step: "vendor" });
  };
  // Leaving the page in the middle of the mapping lets the bytes go too
  onCleanup(dropBytes);

  const onImport = async (vaultIdText: string, contents: EntryContent[], weak: number) => {
    const write = save();
    if (!write) return;
    // From here on only the contents being written hold plaintext, and only until they are
    setStep({ step: "importing", done: 0, total: contents.length });
    const outcome = await runImport(
      (batch) => write(vaultIdText, batch),
      contents,
      (done) => setStep({ step: "importing", done, total: contents.length }),
    );
    setStep({ step: "done", outcome, weak });
  };

  return { step, setStep, onFile, onMapped, backToVendor, onImport };
};

export const ImportPage = (props: { nav: Navigation; deps: ImportDeps }) => {
  const { step, setStep, onFile, onMapped, backToVendor, onImport } = createImportFlow(() =>
    props.deps.save(),
  );
  return (
    <section aria-labelledby="page-title" class="min-h-0 flex-1 overflow-auto p-4 md:p-6">
      <h1 id="page-title" class="mb-2 text-[28px] font-semibold md:text-lg">
        {m.import_title()}
      </h1>
      <p class="mb-4 max-w-xl text-muted-foreground">{m.import_intro()}</p>
      <Switch>
        <Match when={at(step(), "vendor")}>
          <VendorStep
            choices={vendorChoices()}
            onChoose={(choice) => setStep({ step: "file", choice })}
          />
        </Match>
        <Match when={at(step(), "file")}>
          {(file) => (
            <FileStep
              choice={file().choice}
              busy={file().busy ?? false}
              error={file().error}
              onFile={(picked) => void onFile(file().choice, picked)}
              onBack={backToVendor}
            />
          )}
        </Match>
        <Match when={at(step(), "map")}>
          {(map) => (
            <MapStep
              columns={map().columns}
              mapping={map().mapping}
              error={map().error}
              onMapping={(mapping) => setStep({ ...map(), mapping, error: undefined })}
              onNext={() => onMapped(map())}
              onBack={backToVendor}
            />
          )}
        </Match>
        <Match when={at(step(), "preview")}>
          {(preview) => (
            <PreviewStep
              entries={preview().entries}
              vaults={props.deps.vaults()}
              existing={props.deps.existing}
              canWrite={props.deps.save() !== undefined}
              onImport={(vault, contents, weak) => void onImport(vault, contents, weak)}
              onBack={backToVendor}
            />
          )}
        </Match>
        <Match when={at(step(), "importing")}>
          {(running) => <ProgressStep done={running().done} total={running().total} />}
        </Match>
        <Match when={at(step(), "done")}>
          {(done) => (
            <DoneStep
              nav={props.nav}
              outcome={done().outcome}
              weak={done().weak}
              onAgain={() => setStep({ step: "vendor" })}
            />
          )}
        </Match>
      </Switch>
    </section>
  );
};
