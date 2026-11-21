/**
 * Enpass's JSON export (File → Export → .json): folders with their parent, items with a category
 * (`login`, `password`, `creditcard`, `note`, `identity`, …) and a list of fields, each with a type
 * (`username`, `email`, `password`, `url`, `totp`, `ccNumber`, … and `section` headings) and a
 * `sensitive` flag. Fields of known types go into the template fields, the rest are own fields;
 * deleted fields and items in the trash stay out. Source: the types and test data of Bitwarden's
 * enpass importer (bitwarden/clients, libs/importer).
 */
import { z } from "zod";
import { ok } from "../result.ts";
import { custom, type DraftField, imported, known, type TemplateId } from "./entry.ts";
import { list, text } from "./schema.ts";
import { readJson } from "./text.ts";
import type { ImportedEntry, Parser } from "./types.ts";

const Field = z.object({
  label: text,
  type: text,
  value: text,
  sensitive: z.number().nullish(),
  deleted: z.number().nullish(),
});
const Item = z.object({
  title: text,
  note: text,
  category: text,
  favorite: z.number().nullish(),
  trashed: z.number().nullish(),
  folders: list(z.string()),
  fields: list(Field),
});
const Folder = z.object({ uuid: z.string(), title: text, parent_uuid: text });
const Export = z.object({ folders: list(Folder), items: z.array(Item) });

type Item = z.infer<typeof Item>;
type Field = z.infer<typeof Field>;
type Folder = z.infer<typeof Folder>;

/** Enpass field types that are a template field */
const TEMPLATE_TYPES = new Map<string, TemplateId>([
  ["username", "username"],
  ["password", "password"],
  ["url", "website"],
  ["totp", "totp"],
  ["ccName", "holder"],
  ["ccNumber", "number"],
  ["ccExpiry", "expiry"],
  ["ccCvc", "cvc"],
  ["ccPin", "pin"],
]);
const TYPES = new Map<string, ImportedEntry["content"]["type"]>([
  ["creditcard", "card"],
  ["note", "note"],
  ["identity", "identity"],
]);

const fieldOf = (field: Field): DraftField => {
  const template = TEMPLATE_TYPES.get(field.type);
  if (template) return known(template, field.value);
  if (field.type === "email") return custom(field.label, field.value, "email");
  return custom(field.label, field.value, field.sensitive === 1 ? "secret" : "text");
};

/** A folder's path from the top; a loop in the parents ends where it would repeat */
const pathOf = (folders: Map<string, Folder>, uuid: string): string => {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let folder = folders.get(uuid); folder && !seen.has(folder.uuid); ) {
    seen.add(folder.uuid);
    names.unshift(folder.title);
    folder = folders.get(folder.parent_uuid);
  }
  return names.join("/");
};

const entryOf =
  (folders: Map<string, Folder>) =>
  (item: Item): ImportedEntry =>
    imported({
      type: TYPES.get(item.category) ?? "login",
      title: item.title,
      fields: item.fields
        .filter((field) => field.deleted !== 1 && field.type !== "section")
        .map(fieldOf),
      notes: item.note,
      favorite: item.favorite === 1,
      folders: item.folders.map((uuid) => pathOf(folders, uuid)),
    });

export const parseEnpassJson: Parser = (input) => {
  const json = readJson(input, Export);
  if (!json.ok) return json;
  const folders = new Map(json.value.folders.map((folder) => [folder.uuid, folder]));
  return ok(json.value.items.filter((item) => item.trashed !== 1).map(entryOf(folders)));
};
