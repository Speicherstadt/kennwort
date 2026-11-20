/**
 * The generator (K-306): a password or a passphrase, made anew on every change of the options,
 * with its strength, to copy or to make again. The options are remembered on the device, what it
 * made is not. Shared by the generator page and, later, the extension's popup.
 */

import { PASSPHRASE_WORDS, PASSWORD_LENGTH, type Strength, strengthOf } from "@kennwort/core";
import { Icon, IconButton, m, Tabs, type Toasts } from "@kennwort/ui";
import { Copy, RefreshCw } from "@kennwort/ui/icons";
import { createSignal, For } from "solid-js";
import { copyText } from "../frame/secret-field.tsx";
import { selectClass } from "../vaults/role-select.tsx";
import { bitsOf, makeSecret } from "./make.ts";
import {
  type GeneratorKind,
  type GeneratorSettings,
  readSettings,
  SEPARATORS,
  writeSettings,
} from "./settings.ts";

const strengthText: Record<Strength, (bits: number) => string> = {
  weak: (bits) => m.generator_strength_weak({ bits }),
  good: (bits) => m.generator_strength_good({ bits }),
  strong: (bits) => m.generator_strength_strong({ bits }),
};

const storage = () => (typeof localStorage === "undefined" ? undefined : localStorage);

const Check = (props: { label: string; checked: boolean; onChange: (on: boolean) => void }) => (
  <label class="flex min-h-11 items-center gap-2 text-[13px] md:min-h-8">
    <input
      type="checkbox"
      class="size-4 accent-primary"
      checked={props.checked}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
    />
    {props.label}
  </label>
);

const Range = (props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onInput: (value: number) => void;
}) => (
  <label class="grid gap-1 text-[13px]">
    {props.label}
    <input
      type="range"
      class="h-11 accent-primary md:h-6"
      min={props.min}
      max={props.max}
      value={props.value}
      onInput={(event) => props.onInput(Number(event.currentTarget.value))}
    />
  </label>
);

type OptionsProps = {
  /** An accessor, so a change updates the form in place instead of building it anew */
  settings: () => GeneratorSettings;
  change: (update: (now: GeneratorSettings) => GeneratorSettings) => void;
};

const PasswordOptionsForm = (props: OptionsProps) => {
  const set = (part: Partial<GeneratorSettings["password"]>) =>
    props.change((now) => ({ ...now, password: { ...now.password, ...part } }));
  return (
    <div class="grid gap-2">
      <Range
        label={m.generator_length({ length: props.settings().password.length })}
        value={props.settings().password.length}
        min={PASSWORD_LENGTH.min}
        max={PASSWORD_LENGTH.max}
        onInput={(length) => set({ length })}
      />
      <Check
        label={m.generator_digits()}
        checked={props.settings().password.digits}
        onChange={(digits) => set({ digits })}
      />
      <Check
        label={m.generator_symbols()}
        checked={props.settings().password.symbols}
        onChange={(symbols) => set({ symbols })}
      />
    </div>
  );
};

const PhraseOptionsForm = (props: OptionsProps) => {
  const set = (part: Partial<GeneratorSettings["passphrase"]>) =>
    props.change((now) => ({ ...now, passphrase: { ...now.passphrase, ...part } }));
  return (
    <div class="grid gap-2">
      <Range
        label={m.generator_words({ count: props.settings().passphrase.words })}
        value={props.settings().passphrase.words}
        min={PASSPHRASE_WORDS.min}
        max={PASSPHRASE_WORDS.max}
        onInput={(words) => set({ words })}
      />
      <label class="grid w-fit gap-1 text-[13px]">
        {m.generator_separator()}
        <select
          class={selectClass}
          value={props.settings().passphrase.separator}
          onChange={(event) => set({ separator: event.currentTarget.value })}
        >
          <For each={SEPARATORS}>
            {(s) => <option value={s}>{s === " " ? m.generator_separator_space() : s}</option>}
          </For>
        </select>
      </label>
      <Check
        label={m.generator_capitalize()}
        checked={props.settings().passphrase.capitalize}
        onChange={(capitalize) => set({ capitalize })}
      />
      <Check
        label={m.generator_digit()}
        checked={props.settings().passphrase.digit}
        onChange={(digit) => set({ digit })}
      />
    </div>
  );
};

export const GeneratorPanel = (props: { toasts: Toasts }) => {
  const remembered = readSettings(storage());
  const [settings, setSettings] = createSignal(remembered);
  // A plain mirror: Solid 2 hands back the old value until the next flush, and two quick changes
  // must build on each other
  let latest = remembered;
  const [value, setValue] = createSignal("");
  /** Only the newest one shows: a passphrase may still wait for the word list */
  let made = 0;
  const show = async (next: GeneratorSettings) => {
    const mine = ++made;
    const secret = await makeSecret(next);
    if (mine === made) setValue(secret);
  };
  const change = (update: (now: GeneratorSettings) => GeneratorSettings) => {
    latest = update(latest);
    setSettings(latest);
    writeSettings(storage(), latest);
    void show(latest);
  };
  const kindLabel = () =>
    settings().kind === "password" ? m.generator_password() : m.generator_passphrase();
  void show(remembered);
  return (
    <div class="grid max-w-xl gap-4">
      <div class="flex items-center gap-2 rounded-xl border border-border px-3.5 py-3">
        <output
          aria-label={m.generator_result()}
          aria-live="polite"
          class="min-w-0 flex-1 break-all font-mono text-lg"
        >
          {value()}
        </output>
        <IconButton label={m.generator_new()} onClick={() => void show(latest)}>
          <Icon icon={RefreshCw} />
        </IconButton>
        <IconButton
          label={m.field_copy({ field: kindLabel() })}
          onClick={() => copyText(value(), kindLabel(), props.toasts)}
        >
          <Icon icon={Copy} />
        </IconButton>
      </div>
      <p class="text-xs text-muted-foreground">
        {strengthText[strengthOf(bitsOf(settings()))](bitsOf(settings()))}
      </p>
      <Tabs
        label={m.generator_kind()}
        initial={remembered.kind}
        onChange={(kind) => change((now) => ({ ...now, kind: kind as GeneratorKind }))}
        tabs={[
          {
            id: "password",
            label: m.generator_password(),
            content: () => <PasswordOptionsForm settings={settings} change={change} />,
          },
          {
            id: "passphrase",
            label: m.generator_passphrase(),
            content: () => <PhraseOptionsForm settings={settings} change={change} />,
          },
        ]}
      />
    </div>
  );
};
