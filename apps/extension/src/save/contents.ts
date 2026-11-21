/**
 * The entry content the save prompt writes (K-404), in the web app's shape: a new login with the
 * login type's fields (packages/client entry-types.ts) named in the app's language, as the web
 * app's dialog stores them; an update that replaces the password and puts the old one into the
 * history, capped as the web app caps it (entry-history.ts, K-306 part 5).
 */
import { historyAfter } from "@kennwort/client/entries/entry-history.ts";
import { TEMPLATES } from "@kennwort/client/entries/entry-types.ts";
import type { EntryContent } from "@kennwort/core";
import type { Capture } from "./messages.ts";

const seconds = (ms: number) => Math.floor(ms / 1000);

/** Where a new entry points: the page's origin, which its exact host is read from again */
const websiteOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

/** A new login for the page: titled with its host, with the user name, password and website */
export const newLogin = (capture: Capture): EntryContent => {
  const values: Record<string, string> = {
    username: capture.username.trim(),
    password: capture.password,
    website: websiteOf(capture.url),
  };
  return {
    type: "login",
    title: capture.host,
    fields: TEMPLATES.login.map((t) => ({
      id: t.id,
      name: t.label(),
      value: values[t.id] ?? "",
      kind: t.kind,
    })),
    tags: [],
    favorite: false,
    history: [],
  };
};

/**
 * The entry with the new password; the old one goes into the history. An entry without a password
 * field gets one, as the login type has it.
 */
export const withPassword = (
  content: EntryContent,
  password: string,
  now: number,
): EntryContent => {
  const has = content.fields.some((field) => field.id === "password");
  const template = TEMPLATES.login.find((t) => t.id === "password");
  const fields = has
    ? content.fields.map((field) =>
        field.id === "password" ? { ...field, value: password } : field,
      )
    : [
        ...content.fields,
        { id: "password", name: template?.label() ?? "", value: password, kind: "secret" as const },
      ];
  return { ...content, fields, history: historyAfter(content, fields, seconds(now)) };
};
