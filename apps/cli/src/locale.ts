/**
 * The CLI's language from the locale settings (K-606), in the order POSIX gives them: LC_ALL, then
 * LC_MESSAGES, then LANG; the first one set decides. German where it asks for German, English for
 * everything else (C, POSIX, other languages), as command-line tools do. The texts are the app's
 * own (Paraglide, messages/de.json and en.json); the runtime is told the language once at start.
 */
import { type Locale, overwriteGetLocale } from "@kennwort/ui/messages";

type Env = Record<string, string | undefined>;

export const localeOf = (env: Env): Locale => {
  const setting = [env.LC_ALL, env.LC_MESSAGES, env.LANG].find((value) => value) ?? "";
  return /^de([_.@-]|$)/i.test(setting) ? "de" : "en";
};

/** Every text from now on in this language */
export const useLocale = (locale: Locale) => overwriteGetLocale(() => locale);
