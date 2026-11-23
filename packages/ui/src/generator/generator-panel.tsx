/**
 * The generator (K-306): a password or a passphrase, made anew on every change of the options,
 * with its strength, to copy or to make again. The options are remembered on the device, what it
 * made is not. Shared by the web app's generator page and the extension's popup; where they are
 * remembered is the app's choice (the extension remembers nothing outside its session area).
 */

import {
  DIGITS,
  MIN_COUNT,
  PASSPHRASE_WORDS,
  PASSWORD_LENGTH,
  type Strength,
  SYMBOLS,
  strengthOf,
} from "@kennwort/core";
import { createSignal, For, Show, untrack } from "solid-js";
import { IconButton } from "../components/button.tsx";
import { Checkbox } from "../components/checkbox.tsx";
import { Icon } from "../components/icon.tsx";
import { selectClass } from "../components/select.ts";
import { Tabs } from "../components/tabs.tsx";
import type { Toasts } from "../components/toast.tsx";
import { Copy, RefreshCw } from "../icons.ts";
import { copyText } from "../lib/copy.ts";
import { m } from "../paraglide/messages.js";
import { bitsOf, makeSecret } from "./make.ts";
import {
  type GeneratorKind,
  type GeneratorSettings,
  readSettings,
  SEPARATORS,
  type SettingsStorage,
  writeSettings,
} from "./settings.ts";

const strengthText: Record<Strength, (bits: number) => string> = {
  weak: (bits) => m.generator_strength_weak({ bits }),
  good: (bits) => m.generator_strength_good({ bits }),
  strong: (bits) => m.generator_strength_strong({ bits }),
};

const Check = (props: { label: string; checked: boolean; onChange: (on: boolean) => void }) => (
  <label class="flex min-h-11 items-center gap-2 text-[13px] md:min-h-8">
    <Checkbox
      checked={props.checked}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
    />
    {props.label}
  </label>
);

/** A checkbox with how many at least, the count only while the box is checked */
const CheckWithMin = (props: {
  label: string;
  minLabel: string;
  checked: boolean;
  min: number;
  onChange: (on: boolean) => void;
  onMin: (min: number) => void;
}) => (
  <div class="flex items-center gap-3">
    <Check label={props.label} checked={props.checked} onChange={props.onChange} />
    <Show when={props.checked}>
      <input
        type="number"
        aria-label={props.minLabel}
        class="h-8 w-14 rounded-lg border border-border bg-background px-2 text-[13px]"
        min={MIN_COUNT.min}
        max={MIN_COUNT.max}
        value={props.min}
        onInput={(event) => {
          const value = Number(event.currentTarget.value);
          if (Number.isInteger(value) && value >= MIN_COUNT.min && value <= MIN_COUNT.max)
            props.onMin(value);
        }}
      />
    </Show>
  </div>
);

/** Digits and symbols in their own colors, so a 0 is told from an O; the text stays the same */
const kindClass = (c: string) =>
  DIGITS.includes(c)
    ? "text-sky-500 dark:text-sky-400"
    : SYMBOLS.includes(c)
      ? "text-rose-500 dark:text-rose-400"
      : undefined;

const Colored = (props: { value: string }) => (
  <For each={[...props.value]} keyed={false}>
    {(c) => <span class={kindClass(c())}>{c()}</span>}
  </For>
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
      <CheckWithMin
        label={m.generator_digits()}
        minLabel={m.generator_min_digits()}
        checked={props.settings().password.digits}
        min={props.settings().password.minDigits}
        onChange={(digits) => set({ digits })}
        onMin={(minDigits) => set({ minDigits })}
      />
      <CheckWithMin
        label={m.generator_symbols()}
        minLabel={m.generator_min_symbols()}
        checked={props.settings().password.symbols}
        min={props.settings().password.minSymbols}
        onChange={(symbols) => set({ symbols })}
        onMin={(minSymbols) => set({ minSymbols })}
      />
      <Check
        label={m.generator_avoid_ambiguous()}
        checked={props.settings().password.avoidAmbiguous}
        onChange={(avoidAmbiguous) => set({ avoidAmbiguous })}
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

export const GeneratorPanel = (props: {
  toasts: Toasts;
  /** Where the options are remembered; without one they hold until the panel goes */
  storage?: SettingsStorage | undefined;
}) => {
  // Read once: the storage is the app's choice and does not change while the panel lives
  const storage = untrack(() => props.storage);
  const remembered = readSettings(storage);
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
    writeSettings(storage, latest);
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
          <Colored value={value()} />
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
