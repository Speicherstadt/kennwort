/**
 * Making a password or a passphrase with the settings (K-306): uniform picks from the platform's
 * CSPRNG; the word list is a module of its own, loaded the first time a passphrase is made
 */
import {
  type PasswordOptions,
  passphrase,
  passphraseBits,
  password,
  passwordBits,
  randomBelow,
} from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";
import type { GeneratorSettings } from "./settings.ts";

const below = randomBelow(randomBytes);
let words: Promise<readonly string[]> | undefined;
const loadWords = () => {
  words ??= import("@kennwort/core/words").then((module) => module.effLargeWords);
  return words;
};
/** The size of the EFF large list, known before it loads, so the strength shows at once */
const LIST_SIZE = 7776;

export const makePassword = (options: PasswordOptions) => password(options, below);

export const makeSecret = async (settings: GeneratorSettings): Promise<string> =>
  settings.kind === "password"
    ? makePassword(settings.password)
    : passphrase(settings.passphrase, await loadWords(), below);

export const bitsOf = (settings: GeneratorSettings) =>
  settings.kind === "password"
    ? passwordBits(settings.password)
    : passphraseBits(settings.passphrase, LIST_SIZE);
