/**
 * What the generator makes, remembered per device (K-306; the web app in its local storage, the
 * extension not at all): the kind and the options, nothing it made. A storage that throws or holds
 * something else gives the defaults.
 */
import {
  MIN_COUNT,
  PASSPHRASE_WORDS,
  PASSWORD_LENGTH,
  type PassphraseOptions,
  type PasswordOptions,
} from "@kennwort/core";

export type GeneratorKind = "password" | "passphrase";
export type GeneratorSettings = {
  kind: GeneratorKind;
  /** Every option stored, so the form shows what the password is made with */
  password: Required<PasswordOptions>;
  passphrase: PassphraseOptions;
};
export const SEPARATORS = ["-", ".", "_", " "] as const;

export const DEFAULT_SETTINGS: GeneratorSettings = {
  kind: "password",
  password: {
    length: PASSWORD_LENGTH.initial,
    digits: true,
    symbols: true,
    avoidAmbiguous: false,
    minDigits: MIN_COUNT.initial,
    minSymbols: MIN_COUNT.initial,
  },
  passphrase: { words: PASSPHRASE_WORDS.initial, separator: "-", capitalize: false, digit: false },
};
const KEY = "kennwort-generator";

/** The part of the Web Storage API the settings need */
export type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

type Loose = Record<string, unknown>;
const record = (value: unknown): Loose =>
  typeof value === "object" && value !== null ? (value as Loose) : {};
const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const whole = (value: unknown, fallback: number, { min, max }: { min: number; max: number }) =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max
    ? (value as number)
    : fallback;

/** Every field on its own: one that does not fit falls back, the others stay */
export const parseSettings = (value: unknown): GeneratorSettings => {
  const all = record(value);
  const pw = record(all.password);
  const pp = record(all.passphrase);
  const d = DEFAULT_SETTINGS;
  return {
    kind: all.kind === "passphrase" ? "passphrase" : "password",
    password: {
      length: whole(pw.length, d.password.length, PASSWORD_LENGTH),
      digits: flag(pw.digits, d.password.digits),
      symbols: flag(pw.symbols, d.password.symbols),
      // Settings stored before these options existed lack them and take the defaults
      avoidAmbiguous: flag(pw.avoidAmbiguous, d.password.avoidAmbiguous),
      minDigits: whole(pw.minDigits, d.password.minDigits, MIN_COUNT),
      minSymbols: whole(pw.minSymbols, d.password.minSymbols, MIN_COUNT),
    },
    passphrase: {
      words: whole(pp.words, d.passphrase.words, PASSPHRASE_WORDS),
      separator: SEPARATORS.find((s) => s === pp.separator) ?? d.passphrase.separator,
      capitalize: flag(pp.capitalize, d.passphrase.capitalize),
      digit: flag(pp.digit, d.passphrase.digit),
    },
  };
};

export const readSettings = (storage: Pick<Storage, "getItem"> | undefined) => {
  try {
    const text = storage?.getItem(KEY);
    return parseSettings(text ? JSON.parse(text) : undefined);
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const writeSettings = (
  storage: Pick<Storage, "setItem"> | undefined,
  settings: GeneratorSettings,
) => {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not remembered on this device; the options still hold until the page is closed
  }
};
