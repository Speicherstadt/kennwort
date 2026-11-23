/**
 * The first steps of the import (K-501): the vendor, where its export is and the file, and for any
 * table the mapping of its columns. The file is read here, on the device, and handed on as bytes;
 * nothing of it goes to the server.
 */
import type { Columns } from "@kennwort/core";
import { Button, Icon, m, panelClass, panelTitleClass, selectClass } from "@kennwort/ui";
import { ChevronRight } from "@kennwort/ui/icons";
import { createUniqueId, For, Show } from "solid-js";
import { alertClass } from "../blocks/blocks.tsx";
import { TABLE_PARTS, type TablePart } from "./read-file.ts";
import type { VendorChoice } from "./vendors.ts";

export const Alert = (props: { text: string | undefined }) => (
  <Show when={props.text}>
    {(text) => (
      <p class={alertClass} role="alert">
        {text()}
      </p>
    )}
  </Show>
);

export const VendorStep = (props: {
  choices: VendorChoice[];
  onChoose: (choice: VendorChoice) => void;
}) => (
  <div class={panelClass}>
    <h2 id="import-vendor" class={panelTitleClass}>
      {m.import_vendor_step()}
    </h2>
    <ul aria-labelledby="import-vendor" class="grid gap-1.5 sm:grid-cols-2">
      <For each={props.choices}>
        {(choice) => (
          <li>
            <Button
              class="h-11 w-full justify-between md:h-10"
              onClick={() => props.onChoose(choice)}
            >
              {choice.label()}
              <Icon icon={ChevronRight} class="text-muted-foreground" />
            </Button>
          </li>
        )}
      </For>
    </ul>
  </div>
);

export const FileStep = (props: {
  choice: VendorChoice;
  busy: boolean;
  error: string | undefined;
  onFile: (file: File) => void;
  onBack: () => void;
}) => {
  const id = createUniqueId();
  return (
    <div class={`${panelClass} gap-4`}>
      <h2 class={panelTitleClass}>{props.choice.label()}</h2>
      <section aria-labelledby={`${id}-howto`} class="rounded-lg bg-accent p-3.5">
        <h3 id={`${id}-howto`} class="mb-1 text-xs font-medium">
          {m.import_howto_title()}
        </h3>
        <p class="text-[13px]">{props.choice.howTo()}</p>
      </section>
      <div class="grid gap-1.5">
        <label for={id} class="text-xs font-medium">
          {m.import_file()}
        </label>
        <input
          id={id}
          type="file"
          accept={props.choice.accept}
          disabled={props.busy}
          aria-describedby={`${id}-hint`}
          class="rounded-md border border-dashed border-border p-3 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-primary-foreground"
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            // The picker lets go of the file at once: the bytes are all the flow keeps
            input.value = "";
            if (file) props.onFile(file);
          }}
        />
        <p id={`${id}-hint`} class="text-xs text-muted-foreground">
          {props.busy ? m.import_reading() : m.import_file_hint()}
        </p>
      </div>
      <Alert text={props.error} />
      <Button class="w-fit" onClick={() => props.onBack()}>
        {m.import_back()}
      </Button>
    </div>
  );
};

const PART_LABEL: Record<TablePart, () => string> = {
  title: () => m.import_part_title(),
  username: () => m.import_part_username(),
  password: () => m.import_part_password(),
  url: () => m.import_part_url(),
  totp: () => m.import_part_totp(),
  notes: () => m.import_part_notes(),
  folder: () => m.import_part_folder(),
  tags: () => m.import_part_tags(),
};

const ColumnSelect = (props: {
  part: TablePart;
  columns: string[];
  value: string | undefined;
  onChange: (column: string | undefined) => void;
}) => {
  const id = createUniqueId();
  return (
    <div class="grid gap-1">
      <label for={id} class="text-xs font-medium">
        {PART_LABEL[props.part]()}
      </label>
      <select
        id={id}
        class={selectClass}
        value={props.value ?? ""}
        onChange={(event) => props.onChange(event.currentTarget.value || undefined)}
      >
        <option value="">{m.import_map_none()}</option>
        <For each={props.columns}>{(column) => <option value={column}>{column}</option>}</For>
      </select>
    </div>
  );
};

/** A mapping with this part set to the column, or left out */
const withPart = (mapping: Columns, part: TablePart, column: string | undefined): Columns => {
  const { [part]: _, ...rest } = mapping;
  return column === undefined ? rest : { ...rest, [part]: column };
};

export const MapStep = (props: {
  columns: string[];
  mapping: Columns;
  error: string | undefined;
  onMapping: (mapping: Columns) => void;
  onNext: () => void;
  onBack: () => void;
}) => (
  <form
    class={`${panelClass} gap-4`}
    onSubmit={(event) => {
      event.preventDefault();
      props.onNext();
    }}
  >
    <h2 class={panelTitleClass}>{m.import_map_title()}</h2>
    <p class="text-[13px] text-muted-foreground">{m.import_map_intro()}</p>
    <div class="grid grid-cols-2 gap-3">
      <For each={TABLE_PARTS}>
        {(part) => (
          <ColumnSelect
            part={part}
            columns={props.columns}
            value={props.mapping[part]}
            onChange={(column) => props.onMapping(withPart(props.mapping, part, column))}
          />
        )}
      </For>
    </div>
    <Alert text={props.error} />
    <div class="flex gap-2">
      <Button onClick={() => props.onBack()}>{m.import_back()}</Button>
      <Button type="submit" variant="primary">
        {m.import_next()}
      </Button>
    </div>
  </form>
);
