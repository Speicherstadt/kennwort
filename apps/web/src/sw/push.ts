/**
 * What the service worker does with a push (K-602, P-24): the push is empty, so it shows one fixed
 * text in the browser's language and, on a click, brings an open window of the app to the
 * notifications or opens one there. Nothing of the push is read: there is nothing in it.
 */

/**
 * The texts `push_title` and `push_body` of the Paraglide messages (messages/*.json), which the
 * build writes in (scripts/build-worker.ts): the worker carries these two, not Paraglide's runtime
 */
export type PushTexts = Record<"de" | "en", { title: string; body: string }>;

/** German for a browser that prefers German before English, else English */
export const pushLocale = (languages: readonly string[]): "de" | "en" => {
  for (const language of languages) {
    const primary = language.toLowerCase().split("-")[0];
    if (primary === "de" || primary === "en") return primary;
  }
  return "en";
};

/** One tag for all: a new push replaces the one still shown instead of stacking up */
export const pushNotification = (languages: readonly string[], texts: PushTexts) => {
  const text = texts[pushLocale(languages)];
  return {
    title: text.title,
    options: { body: text.body, icon: "/icons/icon-192.png", tag: "kennwort" },
  };
};

/** The texts as the build reads them from the message files */
export const pushTextsOf = (messages: Record<"de" | "en", Record<string, unknown>>): PushTexts => {
  const of = (locale: "de" | "en") => {
    const { push_title: title, push_body: body } = messages[locale];
    if (typeof title !== "string" || typeof body !== "string")
      throw new Error(`push texts missing in messages/${locale}.json`); // i18n-ignore: for developers
    return { title, body };
  };
  return { de: of("de"), en: of("en") };
};

export const NOTIFICATIONS_PATH = "/notifications";

type WindowClient = {
  url: string;
  focus: () => Promise<unknown>;
  navigate: (url: string) => Promise<unknown>;
};
export type ClickDeps = {
  origin: string;
  windows: () => Promise<readonly WindowClient[]>;
  open: (url: string) => Promise<unknown>;
};

/** A window of the app on this origin is focused and led to the notifications; else a new one */
export const openNotifications = async (deps: ClickDeps) => {
  const target = new URL(NOTIFICATIONS_PATH, deps.origin).href;
  const own = (await deps.windows()).find((w) => new URL(w.url).origin === deps.origin);
  if (!own) return deps.open(target);
  await own.focus();
  return own.navigate(target);
};
