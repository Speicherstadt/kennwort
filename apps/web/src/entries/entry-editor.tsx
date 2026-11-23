/**
 * A new entry or a change to one (K-306 parts 1, 2 and 5), inline in the entry's pane instead of a
 * dialog (DESIGN.md, Eintrag bearbeiten): for a new entry the vault (only vaults this account may
 * edit in) and the type; the title, the type's fields and the owner's own, which can be added,
 * renamed and removed, and the tags. A sticky bar holds „Abbrechen“ and „Speichern“; Esc cancels,
 * Ctrl or Cmd+Enter saves, and leaving with unsaved changes asks first.
 */

import type { SaveError } from "@kennwort/client/entries/entry-store.ts";
import { type EntryType, typeChoices, typeLabel } from "@kennwort/client/entries/entry-types.ts";
import { encodeBytes } from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";
import { Badge, Button, Icon, Input, m, panelClass, panelTitleClass } from "@kennwort/ui";
import { makePassword } from "@kennwort/ui/generator/make.ts";
import { readSettings } from "@kennwort/ui/generator/settings.ts";
import { Plus } from "@kennwort/ui/icons";
import { createSignal, createUniqueId, For, onSettled, Show } from "solid-js";
import { Choice } from "./choice.tsx";
import { DiscardDialog } from "./entry-discard.tsx";
import { FieldValue, OwnField } from "./entry-fields.tsx";
import { type EntryInput, type InputField, withType } from "./entry-input.ts";
import { TagsInput } from "./entry-tags.tsx";

export type EditorVault = { idText: string; name: string };
type Saved = { ok: true; value: string } | { ok: false; error: SaveError };
/** Set before a link leaves the page; returns its removal (Navigation.setGuard) */
export type EditorGuard = (check: (proceed: () => void) => boolean) => () => void;

/** A password with the options last chosen in the generator, on this device */
const generated = () =>
  makePassword(
    readSettings(typeof localStorage === "undefined" ? undefined : localStorage).password,
  );

const errorText = (error: SaveError) =>
  error === "read-only"
    ? m.entry_editor_read_only()
    : error === "rotation-due"
      ? m.entry_editor_rotation_due()
      : m.entry_editor_failed();

const newOwnField = (): InputField => ({
  id: `c-${encodeBytes(randomBytes(9))}`,
  name: "",
  value: "",
  kind: "text",
  own: true,
  added: true,
});

/** Esc outside a nested dialog cancels; Ctrl or Cmd+Enter saves, also from a text area */
const editorKeys = (event: KeyboardEvent, cancel: () => void) => {
  const inDialog = (event.target as Element | null)?.closest("dialog");
  if (event.defaultPrevented || inDialog) return;
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
  } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    (event.currentTarget as HTMLFormElement).requestSubmit();
  }
};

/**
 * Leaving the editor: at once without changes, else after the question; a link elsewhere in the
 * app asks the same through the navigation's guard, closing the tab through the browser's own
 */
const createLeaving = (opts: {
  changed: () => boolean;
  onClose: (savedId?: string) => void;
  guard: EditorGuard | undefined;
}) => {
  const [asking, setAsking] = createSignal<() => void>();
  let release = () => {};
  const close = (savedId?: string) => {
    release();
    opts.onClose(savedId);
  };
  const leave = (then: () => void) => {
    if (!opts.changed()) return then();
    setAsking(() => then);
  };
  onSettled(() => {
    release =
      opts.guard?.((proceed) => {
        if (!opts.changed()) {
          close();
          return false;
        }
        setAsking(() => () => {
          close();
          proceed();
        });
        return true;
      }) ?? (() => {});
    const unload = (event: BeforeUnloadEvent) => {
      if (opts.changed()) event.preventDefault();
    };
    addEventListener("beforeunload", unload);
    return () => {
      release();
      removeEventListener("beforeunload", unload);
    };
  });
  return { asking, setAsking, leave, close };
};

/** The fields of the entry: the type's, then the owner's own, and a way to add one */
const FieldsPanel = (props: {
  id: string;
  fields: InputField[];
  update: (change: (now: EntryInput) => EntryInput) => void;
}) => {
  const setField = (field: InputField) =>
    props.update((now) => ({
      ...now,
      fields: now.fields.map((f) => (f.id === field.id ? field : f)),
    }));
  const remove = (id: string) =>
    props.update((now) => ({ ...now, fields: now.fields.filter((f) => f.id !== id) }));
  return (
    <section class={panelClass} aria-labelledby={props.id}>
      <h2 id={props.id} class={panelTitleClass}>
        {m.entry_editor_fields()}
      </h2>
      <For each={props.fields} keyed={(f) => f.id}>
        {(field) => (
          <Show
            when={field().own}
            fallback={
              <FieldValue
                field={field()}
                label={field().name}
                onValue={(value) => setField({ ...field(), value })}
                generate={generated}
              />
            }
          >
            <OwnField
              field={field()}
              onChange={setField}
              onRemove={() => remove(field().id)}
              generate={generated}
            />
          </Show>
        )}
      </For>
      <Button
        type="button"
        variant="ghost"
        class="w-fit"
        onClick={() => props.update((now) => ({ ...now, fields: [...now.fields, newOwnField()] }))}
      >
        <Icon icon={Plus} /> {m.entry_editor_add_field()}
      </Button>
    </section>
  );
};

/** The sticky bar at the bottom of the pane: whether something is unsaved, cancel and save */
const ActionBar = (props: { unsaved: boolean; busy: boolean; onCancel: () => void }) => (
  <div class="sticky bottom-0 mt-auto border-t border-border bg-background/95 backdrop-blur">
    <div class="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-3 md:px-6">
      <Show when={props.unsaved}>
        <Badge tone="warning">{m.entry_editor_unsaved()}</Badge>
      </Show>
      <Button class="ml-auto h-11 md:h-8" onClick={() => props.onCancel()}>
        {m.entry_editor_cancel()}
      </Button>
      <Button type="submit" variant="primary" class="h-11 md:h-8" disabled={props.busy}>
        {m.entry_editor_save()}
      </Button>
    </div>
  </div>
);

export const EntryEditor = (props: {
  title: string;
  initial: EntryInput;
  /** The vaults to choose from for a new entry; none for a change, whose type stays */
  vaults?: EditorVault[] | undefined;
  onSave: (input: EntryInput, vaultIdText: string | undefined) => Promise<Saved>;
  onClose: (savedId?: string) => void;
  /** Holds a link back while there are unsaved changes */
  guard?: EditorGuard | undefined;
}) => {
  const titleId = createUniqueId();
  const [input, setInput] = createSignal(props.initial);
  // A plain mirror: Solid 2 hands back the old value until the next flush, and quick changes to
  // two fields must build on each other
  let latest = props.initial;
  const started = JSON.stringify(props.initial);
  const update = (change: (now: EntryInput) => EntryInput) => {
    latest = change(latest);
    setInput(latest);
  };
  // Unset until chosen, so the first vault shows even when the vaults arrive after the editor opened
  const [chosenVault, setVault] = createSignal<string>();
  let vaultChosen = false;
  const vault = () => chosenVault() ?? props.vaults?.[0]?.idText ?? "";
  const [error, setError] = createSignal<SaveError>();
  const [busy, setBusy] = createSignal(false);
  const { asking, setAsking, leave, close } = createLeaving({
    changed: () => vaultChosen || JSON.stringify(latest) !== started,
    onClose: (savedId) => props.onClose(savedId),
    guard: props.guard,
  });
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!latest.title.trim()) return;
    setBusy(true);
    const saved = await props.onSave(latest, props.vaults ? vault() : undefined);
    setBusy(false);
    if (saved.ok) close(saved.value);
    else setError(saved.error);
  };
  return (
    <>
      <form
        aria-labelledby={titleId}
        class="flex min-h-full flex-col"
        onSubmit={submit}
        onKeyDown={(event) => editorKeys(event, () => leave(() => close()))}
      >
        <div class="mx-auto grid w-full max-w-2xl gap-5 p-4 md:p-6">
          <div class="grid gap-1">
            <h1 id={titleId} class="text-[28px] font-semibold md:text-lg">
              {props.title}
            </h1>
            <p class="text-xs text-muted-foreground">{m.entry_editor_keys()}</p>
          </div>
          <section class={panelClass} aria-label={m.entry_editor_basics()}>
            <Show when={props.vaults}>
              {(vaults) => (
                <div class="grid gap-3 sm:grid-cols-2">
                  <Choice
                    label={m.entry_editor_vault()}
                    value={vault()}
                    options={vaults().map((v) => ({ value: v.idText, label: v.name }))}
                    onChange={(id) => {
                      vaultChosen = true;
                      setVault(id);
                    }}
                  />
                  <Choice
                    label={m.entry_editor_type()}
                    value={input().type}
                    options={typeChoices(input().type).map((t) => ({
                      value: t,
                      label: typeLabel(t),
                    }))}
                    onChange={(type) => update((now) => withType(now, type as EntryType))}
                  />
                </div>
              )}
            </Show>
            <Input
              label={m.entry_editor_title()}
              value={input().title}
              required
              autofocus
              onInput={(event) => update((now) => ({ ...now, title: event.currentTarget.value }))}
            />
          </section>
          <FieldsPanel id={`${titleId}-fields`} fields={input().fields} update={update} />
          <section class={panelClass}>
            <TagsInput
              tags={input().tags}
              onChange={(tags) => update((now) => ({ ...now, tags }))}
            />
          </section>
          <Show when={error()}>
            {(e) => (
              <p
                class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger"
                role="alert"
              >
                {errorText(e())}
              </p>
            )}
          </Show>
        </div>
        <ActionBar
          unsaved={JSON.stringify(input()) !== started || chosenVault() !== undefined}
          busy={busy()}
          onCancel={() => leave(() => close())}
        />
      </form>
      <Show when={asking()}>
        {(then) => (
          <DiscardDialog
            open
            onKeep={() => setAsking(undefined)}
            onDiscard={() => {
              setAsking(undefined);
              then()();
            }}
          />
        )}
      </Show>
    </>
  );
};
