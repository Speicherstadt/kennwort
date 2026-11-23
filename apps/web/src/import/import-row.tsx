/**
 * One entry of the import preview (K-501): title, type, username and address – never a secret –
 * with its marks, and for a duplicate the way to take it anyway. A code from an authenticator app
 * (K-503 Teil 2) offers the logins of the vault it can go into, „Zu »Titel« (Benutzer)
 * hinzufügen“, beside a login of its own; a login with another code shows as a conflict and is
 * never offered, one with this code makes the row a duplicate.
 */
import { typeLabel } from "@kennwort/client/entries/entry-types.ts";
import { Badge, badgeVariants, Checkbox, m } from "@kennwort/ui";
import { createUniqueId, For, Show } from "solid-js";
import type { CodeTarget, PreviewRow } from "./preview.ts";

/** A grey chip in the text colour: grey text on grey stays under 4.5:1 (DESIGN.md, Farben) */
export const chipClass = badgeVariants({ variant: "outline" });

const untitled = (title: string) => title || m.import_untitled();
const withState = (row: PreviewRow, state: CodeTarget["state"]) =>
  row.targets.filter((t) => t.state === state);

/** Where the code goes: each login offered, or a login of its own */
const CodeChoice = (props: { row: PreviewRow; target: string; onTarget: (id: string) => void }) => {
  const name = createUniqueId();
  const options = () => [
    ...withState(props.row, "free").map((t) => ({
      value: t.id,
      label: m.import_code_add({ title: untitled(t.title), username: t.username }),
    })),
    { value: "", label: m.import_code_own() },
  ];
  return (
    <fieldset class="grid gap-0.5 text-xs">
      <legend class="mb-0.5 text-muted-foreground">
        {m.import_code_target({ title: untitled(props.row.title) })}
      </legend>
      <For each={options()}>
        {(option) => (
          <label class="flex min-h-11 items-center gap-2 md:min-h-0">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={props.target === option.value}
              onChange={() => props.onTarget(option.value)}
            />
            {option.label}
          </label>
        )}
      </For>
    </fieldset>
  );
};

/** The logins that keep their own code, and the one that has this code already */
const CodeNotes = (props: { row: PreviewRow }) => (
  <>
    <For each={withState(props.row, "conflict")}>
      {(t) => (
        <p class="text-xs text-warning">
          {m.import_code_conflict_text({ title: untitled(t.title), username: t.username })}
        </p>
      )}
    </For>
    <For each={withState(props.row, "same")}>
      {(t) => (
        <p class="text-xs text-muted-foreground">
          {m.import_code_same({ title: untitled(t.title), username: t.username })}
        </p>
      )}
    </For>
  </>
);

export const Row = (props: {
  row: PreviewRow;
  taken: boolean;
  onTake: (take: boolean) => void;
  /** The login the code goes into, "" for its own */
  target: string;
  onTarget: (id: string) => void;
}) => (
  <li class="grid gap-0.5 px-3.5 py-2.5">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-medium">{untitled(props.row.title)}</span>
      <span class="text-xs text-muted-foreground">{typeLabel(props.row.type)}</span>
      <Show when={props.row.duplicate}>
        <span class={chipClass}>{m.import_duplicate()}</span>
      </Show>
      <Show when={props.row.weak}>
        <Badge tone="warning">{m.import_weak()}</Badge>
      </Show>
      <Show when={withState(props.row, "conflict").length > 0}>
        <Badge tone="warning">{m.import_code_conflict()}</Badge>
      </Show>
    </div>
    <Show when={props.row.username || props.row.url}>
      <div class="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>{props.row.username}</span>
        <span class="font-mono break-all">{props.row.url}</span>
      </div>
    </Show>
    <CodeNotes row={props.row} />
    <Show when={!props.row.duplicate && withState(props.row, "free").length > 0}>
      <CodeChoice row={props.row} target={props.target} onTarget={props.onTarget} />
    </Show>
    <Show when={props.row.duplicate}>
      <label class="flex min-h-11 items-center gap-2 text-xs md:min-h-0">
        <Checkbox
          checked={props.taken}
          aria-label={m.import_take_anyway({ title: untitled(props.row.title) })}
          onChange={(event) => props.onTake(event.currentTarget.checked)}
        />
        <span aria-hidden="true">{m.import_take_anyway_short()}</span>
      </label>
    </Show>
  </li>
);
