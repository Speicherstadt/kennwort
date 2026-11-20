/**
 * One field in the entry dialog (K-306 part 2), by its kind: a secret as a password field (with
 * the generator for passwords and passphrases), long text in a text area; the owner's own fields
 * also with their name and kind, and a way to remove them
 */
import { parseTotp } from "@kennwort/core";
import { Icon, IconButton, Input, m, TextArea } from "@kennwort/ui";
import { Trash2, WandSparkles } from "@kennwort/ui/icons";
import { Show } from "solid-js";
import { Choice } from "./choice.tsx";
import type { InputField } from "./entry-input.ts";
import { CUSTOM_KINDS, type FieldKindChoice, kindLabel } from "./entry-types.ts";

const GENERATED = new Set(["password", "passphrase"]);

/** What to paste into a TOTP field, or that what was pasted makes no codes */
const totpHint = (value: string) =>
  value.trim() === "" || parseTotp(value).ok ? m.totp_hint() : m.totp_invalid();
// A TOTP key is as secret as a password; the detail shows its codes, never the key
const inputType = { secret: "password", totp: "password", url: "url", email: "email" } as const;

export const FieldValue = (props: {
  field: InputField;
  label: string;
  onValue: (value: string) => void;
  generate: () => string;
}) => (
  <Show
    when={props.field.kind !== "note"}
    fallback={
      <TextArea
        label={props.label}
        value={props.field.value}
        onInput={(event) => props.onValue(event.currentTarget.value)}
      />
    }
  >
    <div class="flex items-end gap-2">
      <div class="grid flex-1">
        <Input
          label={props.label}
          type={inputType[props.field.kind as keyof typeof inputType] ?? "text"}
          autocomplete={
            props.field.kind === "secret" || props.field.kind === "totp" ? "new-password" : "off"
          }
          value={props.field.value}
          onInput={(event) => props.onValue(event.currentTarget.value)}
          hint={props.field.kind === "totp" ? totpHint(props.field.value) : undefined}
        />
      </div>
      <Show when={props.field.kind === "secret" && GENERATED.has(props.field.id)}>
        <IconButton
          type="button"
          label={m.entry_editor_generate_for({ field: props.label })}
          onClick={() => props.onValue(props.generate())}
        >
          <Icon icon={WandSparkles} />
        </IconButton>
      </Show>
    </div>
  </Show>
);

/** An own field: its name and kind, then its value; a kind this app does not offer stays as it is */
export const OwnField = (props: {
  field: InputField;
  onChange: (field: InputField) => void;
  onRemove: () => void;
  generate: () => string;
}) => (
  <fieldset class="grid gap-2 rounded-lg border border-border p-2.5">
    <div class="flex items-end gap-2">
      <div class="grid flex-1">
        <Input
          label={m.entry_editor_field_name()}
          value={props.field.name}
          onInput={(event) => props.onChange({ ...props.field, name: event.currentTarget.value })}
        />
      </div>
      <Show when={CUSTOM_KINDS.includes(props.field.kind as FieldKindChoice)}>
        <Choice
          label={m.entry_editor_field_kind()}
          value={props.field.kind}
          options={CUSTOM_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
          onChange={(kind) => props.onChange({ ...props.field, kind: kind as FieldKindChoice })}
        />
      </Show>
      <IconButton
        type="button"
        label={
          props.field.name.trim()
            ? m.entry_editor_remove_field({ name: props.field.name })
            : m.entry_editor_remove_unnamed()
        }
        onClick={() => props.onRemove()}
      >
        <Icon icon={Trash2} />
      </IconButton>
    </div>
    <FieldValue
      field={props.field}
      label={props.field.name || kindLabel(props.field.kind)}
      onValue={(value) => props.onChange({ ...props.field, value })}
      generate={props.generate}
    />
  </fieldset>
);
