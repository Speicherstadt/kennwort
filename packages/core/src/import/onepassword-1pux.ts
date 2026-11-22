/**
 * 1Password's 1PUX export (1Password 8, "1Password Unencrypted Export"): a ZIP with
 * `export.attributes`, `export.data` and the attachments under `files/`. `export.data` is JSON:
 * accounts, each with its vaults, each with its items. An item has a category (`categoryUuid`),
 * an `overview` (title, links, tags) and `details`: the fields of the login form (`loginFields`,
 * with `designation` for username and password), sections of fields whose value is an object with
 * one key that says its kind (`concealed`, `totp`, `address`, `sshKey`, …), the notes and earlier
 * passwords. The vault becomes the folder, `favIndex` the favorite; archived items come along,
 * attachments and the form's checkboxes stay out. Source: 1Password's description of the format
 * (support.1password.com/1pux-format) and the types and test data of Bitwarden's 1PUX importer
 * (bitwarden/clients, libs/importer/src/importers/onepassword).
 */
import { z } from "zod";
import { ok } from "../result.ts";
import type { EntryContent } from "../sync/content.ts";
import {
  custom,
  type DraftField,
  imported,
  joinFilled,
  joinLines,
  known,
  login,
  type TemplateId,
} from "./entry.ts";
import { list, section, text } from "./schema.ts";
import { readJson } from "./text.ts";
import type { ImportedEntry, Parser, ZipParser } from "./types.ts";
import { parseZipped } from "./zip.ts";

type EntryType = EntryContent["type"];
type Kind = DraftField["kind"];

/** Seconds since 1970 as YYYY-MM-DD; anything else reads as empty */
const date = z
  .number()
  .transform((seconds) => {
    const day = new Date(seconds * 1000);
    return Number.isNaN(day.getTime()) ? "" : day.toISOString().slice(0, 10);
  })
  .catch("");
/** 1Password writes month and year as one number, YYYYMM; Kennwort's expiry is MM/YYYY */
const monthYear = z
  .number()
  .transform((n) => `${String(n % 100).padStart(2, "0")}/${Math.trunc(n / 100)}`)
  .catch("");
const Address = section({ street: text, city: text, zip: text, state: text, country: text });
const Value = section({
  concealed: text,
  creditCardNumber: text,
  totp: text,
  url: text,
  string: text,
  phone: text,
  menu: text,
  gender: text,
  creditCardType: text,
  email: section({ email_address: text }),
  address: Address,
  date,
  monthYear,
  sshKey: section({ metadata: section({ privateKey: text, publicKey: text, fingerprint: text }) }),
});
const SectionField = z.object({ title: text, id: text, value: Value });
const LoginField = z.object({ value: text, name: text, fieldType: text, designation: text });
const Item = z.object({
  favIndex: z.number().nullish(),
  categoryUuid: text,
  details: section({
    loginFields: list(LoginField),
    notesPlain: text,
    password: text,
    sections: list(z.object({ title: text, fields: list(SectionField) })),
    passwordHistory: list(z.object({ value: text, time: z.number().int().nonnegative().catch(0) })),
  }),
  overview: section({
    title: text,
    url: text,
    urls: list(z.object({ url: text })),
    tags: list(z.string()),
  }),
});
const Export = z.object({
  accounts: z.array(
    z.object({ vaults: list(z.object({ attrs: z.object({ name: text }), items: list(Item) })) }),
  ),
});

type Item = z.infer<typeof Item>;
type Value = z.infer<typeof Value>;
type SectionField = z.infer<typeof SectionField>;
type LoginField = z.infer<typeof LoginField>;

/** 1Password's categories as Kennwort's entry types; any other category becomes a note */
const TYPES = new Map<string, EntryType>([
  ["001", "login"], // Login
  ["005", "login"], // Password
  ["102", "login"], // Database
  ["110", "login"], // Server
  ["002", "card"], // Credit card
  ["004", "identity"], // Identity
  ["109", "wifi"], // Wireless router
  ["112", "api-key"], // API credential
  ["114", "ssh-key"], // SSH key
]);

/** Section fields that fill a field of the entry type, by 1Password's field ID */
const TEMPLATE_IDS = new Map<EntryType, Map<string, TemplateId>>([
  [
    "login",
    new Map<string, TemplateId>([
      ["username", "username"],
      ["password", "password"],
      ["url", "website"],
    ]),
  ],
  [
    "card",
    new Map<string, TemplateId>([
      ["cardholder", "holder"],
      ["ccnum", "number"],
      ["expiry", "expiry"],
      ["cvv", "cvc"],
      ["pin", "pin"],
    ]),
  ],
  [
    "identity",
    new Map<string, TemplateId>([
      ["email", "email"],
      ["defphone", "phone"],
      ["address", "address"],
    ]),
  ],
  [
    "wifi",
    new Map<string, TemplateId>([
      ["network_name", "ssid"],
      ["wireless_password", "password"],
      ["wireless_security", "security"],
    ]),
  ],
  [
    "api-key",
    new Map<string, TemplateId>([
      ["credential", "key"],
      ["hostname", "website"],
    ]),
  ],
]);

/** The parts of an identity's name, joined into its one name field */
const NAME_PARTS = ["firstname", "initial", "lastname"];

/** The login form's checkboxes ("remember me") are the form's state, not a secret */
const CHECKBOX = "C";
const PASSWORD = "P";

const address = (a: Value["address"]) =>
  joinLines(a.street, `${a.zip} ${a.city}`, a.state, a.country.toUpperCase());

/** A section field's value and kind, by the one key its value has; none for an empty one */
const fieldValue = (v: Value): [string, Kind] | undefined => {
  const candidates: [string, Kind][] = [
    [v.concealed || v.creditCardNumber, "secret"],
    [v.totp, "totp"],
    [v.url, "url"],
    [v.email.email_address, "email"],
    [address(v.address), "note"],
    [v.monthYear, "text"],
    [v.date, "text"],
    [v.string || v.phone || v.menu || v.gender || v.creditCardType, "text"],
  ];
  return candidates.find(([value]) => value !== "");
};

const sshKey = ({ metadata }: Value["sshKey"]): DraftField[] => [
  known("private-key", metadata.privateKey),
  known("public-key", metadata.publicKey),
  custom("Fingerprint", metadata.fingerprint),
];

/** One section field: a field of the entry type where there is one, else the owner's own */
const sectionField =
  (type: EntryType, sectionTitle: string) =>
  (field: SectionField): DraftField[] => {
    if (field.value.sshKey.metadata.privateKey !== "") return sshKey(field.value.sshKey);
    const found = fieldValue(field.value);
    if (!found) return [];
    const [value, kind] = found;
    const totp = type === "login" && kind === "totp" ? "totp" : undefined;
    const template = TEMPLATE_IDS.get(type)?.get(field.id) ?? totp;
    if (template) return [known(template, value)];
    return [custom(field.title || sectionTitle || field.id, value, kind)];
  };

const sectionFields = (type: EntryType, item: Item): DraftField[] => {
  const all = item.details.sections.flatMap((s) =>
    s.fields.map((field) => ({ field, sectionTitle: s.title })),
  );
  const isName = ({ field }: { field: SectionField }) => NAME_PARTS.includes(field.id);
  const name = joinFilled(
    " ",
    all.filter(isName).map(({ field }) => field.value.string),
  );
  const rest = all.filter((f) => !isName(f));
  return [
    known("name", name),
    ...rest.flatMap(({ field, sectionTitle }) => sectionField(type, sectionTitle)(field)),
  ];
};

const loginField = (field: LoginField): DraftField[] =>
  field.fieldType === CHECKBOX
    ? []
    : [custom(field.name, field.value, field.fieldType === PASSWORD ? "secret" : "text")];

const entryOf =
  (vault: string) =>
  (item: Item): ImportedEntry => {
    const { details, overview } = item;
    const type = TYPES.get(item.categoryUuid) ?? "note";
    const urls = overview.urls.length > 0 ? overview.urls.map((u) => u.url) : [overview.url];
    const common = {
      title: overview.title,
      notes: details.notesPlain,
      tags: overview.tags,
      favorite: (item.favIndex ?? 0) > 0,
      folders: [vault],
      history: details.passwordHistory.map((old) => ({
        fieldId: "password",
        value: old.value,
        replacedAt: old.time * 1000,
      })),
    };
    const fields = sectionFields(type, item);
    if (type !== "login")
      return imported({
        ...common,
        type,
        fields: [...fields, ...urls.map((url) => known("website", url))],
      });
    const designated = (designation: string) =>
      details.loginFields.find((f) => f.designation === designation)?.value ?? "";
    const form = details.loginFields.filter((f) => f.designation === "").flatMap(loginField);
    return login({
      ...common,
      username: designated("username"),
      password: designated("password") || details.password,
      urls,
      fields: [...form, ...fields],
    });
  };

/** `export.data` on its own, as it is in the 1PUX */
export const parseOnePasswordData: Parser = (input) => {
  const json = readJson(input, Export);
  if (!json.ok) return json;
  return ok(
    json.value.accounts.flatMap((account) =>
      account.vaults.flatMap((vault) => vault.items.map(entryOf(vault.attrs.name))),
    ),
  );
};

export const parseOnePassword1pux: ZipParser = parseZipped(
  "export.data", // i18n-ignore: file name in the vendor's ZIP
  parseOnePasswordData,
);
