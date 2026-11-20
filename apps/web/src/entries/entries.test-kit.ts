// Logins for the entry tests (K-306): the content of a login from its four values, as the dialog
// writes it, so the store's tests read like what a person does

import type { LoginInput } from "@kennwort/client/entries/entries.ts";
import type { EntryContent } from "@kennwort/core";

export type FieldNames = { username: string; password: string; website: string };

export const FIELD = { username: "username", password: "password", website: "website" } as const;

/** The content of a login; field names are labels for other apps, the IDs are what counts here */
export const loginContent = (
  input: LoginInput,
  names: FieldNames,
  base?: EntryContent,
): EntryContent => ({
  type: base?.type ?? "login",
  title: input.title.trim(),
  fields: [
    { id: FIELD.username, name: names.username, value: input.username, kind: "text" },
    { id: FIELD.password, name: names.password, value: input.password, kind: "secret" },
    { id: FIELD.website, name: names.website, value: input.website.trim(), kind: "url" },
    // fields this app does not know yet stay as they were
    ...(base?.fields.filter((f) => !Object.values(FIELD).includes(f.id as never)) ?? []),
  ],
  tags: base?.tags ?? [],
  favorite: base?.favorite ?? false,
  history: base?.history ?? [],
});
