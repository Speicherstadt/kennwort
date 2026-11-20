/**
 * A new entry or a change to one (K-306 parts 1, 2 and 5), in a dialog: for a new entry the vault
 * (only vaults this account may edit in) and the type; the title, the type's fields and the
 * owner's own, which can be added, renamed and removed, and the tags
 */

import type { SaveError } from "@kennwort/client/entries/entry-store.ts";
import { ENTRY_TYPES, type EntryType, typeLabel } from "@kennwort/client/entries/entry-types.ts";
import { encodeBytes } from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";
import { Button, Dialog, Icon, Input, m } from "@kennwort/ui";
import { makePassword } from "@kennwort/ui/generator/make.ts";
import { readSettings } from "@kennwort/ui/generator/settings.ts";
import { Plus } from "@kennwort/ui/icons";
import { createSignal, For, Show } from "solid-js";
import { Choice } from "./choice.tsx";
import { FieldValue, OwnField } from "./entry-fields.tsx";
import { type EntryInput, type InputField, withType } from "./entry-input.ts";
import { TagsInput } from "./entry-tags.tsx";

export type EditorVault = { idText: string; name: string };
type Saved = { ok: true; value: string } | { ok: false; error: SaveError };

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

export const EntryEditor = (props: {
  title: string;
  initial: EntryInput;
  /** The vaults to choose from for a new entry; none for a change, whose type stays */
  vaults?: EditorVault[] | undefined;
  onSave: (input: EntryInput, vaultIdText: string | undefined) => Promise<Saved>;
  onClose: (savedId?: string) => void;
}) => {
  const [input, setInput] = createSignal(props.initial);
  // A plain mirror: Solid 2 hands back the old value until the next flush, and quick changes to
  // two fields must build on each other
  let latest = props.initial;
  const update = (change: (now: EntryInput) => EntryInput) => {
    latest = change(latest);
    setInput(latest);
  };
  const setField = (field: InputField) =>
    update((now) => ({ ...now, fields: now.fields.map((f) => (f.id === field.id ? field : f)) }));
  // Unset until chosen, so the first vault shows even when the vaults arrive after the dialog opened
  const [chosenVault, setVault] = createSignal<string>();
  const vault = () => chosenVault() ?? props.vaults?.[0]?.idText ?? "";
  const [error, setError] = createSignal<SaveError>();
  const [busy, setBusy] = createSignal(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!latest.title.trim()) return;
    setBusy(true);
    const saved = await props.onSave(latest, props.vaults ? vault() : undefined);
    setBusy(false);
    if (saved.ok) props.onClose(saved.value);
    else setError(saved.error);
  };
  return (
    <Dialog open onClose={() => props.onClose()} title={props.title}>
      <form class="grid gap-3 p-4 pt-2" onSubmit={submit}>
        <Show when={props.vaults}>
          {(vaults) => (
            <div class="grid grid-cols-2 gap-2">
              <Choice
                label={m.entry_editor_vault()}
                value={vault()}
                options={vaults().map((v) => ({ value: v.idText, label: v.name }))}
                onChange={setVault}
              />
              <Choice
                label={m.entry_editor_type()}
                value={input().type}
                options={ENTRY_TYPES.map((t) => ({ value: t, label: typeLabel(t) }))}
                onChange={(type) => update((now) => withType(now, type as EntryType))}
              />
            </div>
          )}
        </Show>
        <Input
          label={m.entry_editor_title()}
          value={input().title}
          required
          onInput={(event) => update((now) => ({ ...now, title: event.currentTarget.value }))}
        />
        <For each={input().fields} keyed={(f) => f.id}>
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
                onRemove={() =>
                  update((now) => ({
                    ...now,
                    fields: now.fields.filter((f) => f.id !== field().id),
                  }))
                }
                generate={generated}
              />
            </Show>
          )}
        </For>
        <Button
          type="button"
          onClick={() => update((now) => ({ ...now, fields: [...now.fields, newOwnField()] }))}
        >
          <Icon icon={Plus} /> {m.entry_editor_add_field()}
        </Button>
        <TagsInput tags={input().tags} onChange={(tags) => update((now) => ({ ...now, tags }))} />
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
        <Button type="submit" variant="primary" disabled={busy()}>
          {m.entry_editor_save()}
        </Button>
      </form>
    </Dialog>
  );
};
