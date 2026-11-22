/**
 * Bitwarden's and Vaultwarden's JSON export, of a personal vault (`folders`, `folderId`) or of an
 * organisation (`collections`, `collectionIds`). Item types: 1 login, 2 secure note, 3 card,
 * 4 identity, 5 SSH key; own fields: 0 text, 1 hidden, 2 boolean, 3 linked (a pointer to another
 * field, left out). Earlier passwords go into the history. A password-protected export needs the
 * password first (`encrypted`, opened by bitwarden-protected.ts); an account-restricted one,
 * encrypted with the Bitwarden account's own key, is `account-encrypted`. Source: bitwarden/clients,
 * libs/importer/src/importers/bitwarden/bitwarden-json-importer.ts and its test data.
 */
import { z } from "zod";
import { err, ok } from "../result.ts";
import {
  custom,
  type DraftField,
  expiry,
  imported,
  joinFilled,
  joinLines,
  known,
  login,
} from "./entry.ts";
import { flag, list, section, text } from "./schema.ts";
import { readJson } from "./text.ts";
import type { ImportedEntry, Parser } from "./types.ts";

const Field = z.object({ name: text, value: text, type: z.number() });
const Item = z.object({
  type: z.number(),
  name: text,
  notes: text,
  favorite: flag,
  folderId: text,
  collectionIds: list(z.string()),
  fields: list(Field),
  login: section({
    username: text,
    password: text,
    totp: text,
    uris: list(z.object({ uri: text })),
  }),
  card: section({ cardholderName: text, number: text, expMonth: text, expYear: text, code: text }),
  identity: section({
    title: text,
    firstName: text,
    middleName: text,
    lastName: text,
    company: text,
    address1: text,
    address2: text,
    address3: text,
    postalCode: text,
    city: text,
    state: text,
    country: text,
    email: text,
    phone: text,
    username: text,
    ssn: text,
    passportNumber: text,
    licenseNumber: text,
  }),
  sshKey: section({ privateKey: text, publicKey: text, keyFingerprint: text }),
  passwordHistory: list(z.object({ password: text, lastUsedDate: text })),
});
const Named = z.object({ id: z.string(), name: text });
const Export = z.object({
  encrypted: flag,
  passwordProtected: flag,
  folders: list(Named),
  collections: list(Named),
  /** Every plain export has its items list, an encrypted one none (checked after the flags) */
  items: z.array(Item).nullish(),
});

type Item = z.infer<typeof Item>;
type Names = Map<string, string>;

const HIDDEN = 1;
const LINKED = 3;

const ownFields = (item: Item): DraftField[] =>
  item.fields
    .filter((field) => field.type !== LINKED)
    .map((field) => custom(field.name, field.value, field.type === HIDDEN ? "secret" : "text"));

const history = (item: Item) =>
  item.passwordHistory.map((old) => ({
    fieldId: "password",
    value: old.password,
    replacedAt: Math.max(0, Date.parse(old.lastUsedDate) || 0),
  }));

const identityFields = ({ identity: id }: Item): DraftField[] => [
  known("name", joinFilled(" ", [id.title, id.firstName, id.middleName, id.lastName])),
  known("email", id.email),
  known("phone", id.phone),
  known(
    "address",
    joinLines(
      id.company,
      id.address1,
      id.address2,
      id.address3,
      `${id.postalCode} ${id.city}`,
      id.state,
      id.country,
    ),
  ),
  custom("Username", id.username),
  custom("Social security number", id.ssn, "secret"),
  custom("Passport number", id.passportNumber, "secret"),
  custom("Licence number", id.licenseNumber, "secret"),
];

/** The fields of each kind other than a login */
const KINDS = new Map<
  number,
  { type: ImportedEntry["content"]["type"]; fields: (item: Item) => DraftField[] }
>([
  [2, { type: "note", fields: () => [] }],
  [
    3,
    {
      type: "card",
      fields: ({ card }) => [
        known("holder", card.cardholderName),
        known("number", card.number),
        known("expiry", expiry(card.expMonth, card.expYear)),
        known("cvc", card.code),
      ],
    },
  ],
  [4, { type: "identity", fields: identityFields }],
  [
    5,
    {
      type: "ssh-key",
      fields: ({ sshKey }) => [
        known("private-key", sshKey.privateKey),
        known("public-key", sshKey.publicKey),
        custom("Fingerprint", sshKey.keyFingerprint),
      ],
    },
  ],
]);

const entryOf = (folders: Names, collections: Names) => (item: Item) => {
  const named = (names: Names, ids: string[]) => ids.map((id) => names.get(id) ?? "");
  const base = {
    title: item.name,
    notes: item.notes,
    favorite: item.favorite,
    folders: [...named(folders, [item.folderId]), ...named(collections, item.collectionIds)],
    history: history(item),
  };
  const kind = KINDS.get(item.type);
  if (kind)
    return imported({
      ...base,
      type: kind.type,
      fields: [...kind.fields(item), ...ownFields(item)],
    });
  return login({
    ...base,
    username: item.login.username,
    password: item.login.password,
    urls: item.login.uris.map((uri) => uri.uri),
    totp: item.login.totp,
    fields: ownFields(item),
  });
};

const byId = (named: { id: string; name: string }[]): Names =>
  new Map(named.map((entry) => [entry.id, entry.name]));

export const parseBitwardenJson: Parser = (input) => {
  const json = readJson(input, Export);
  if (!json.ok) return json;
  const file = json.value;
  if (file.passwordProtected) return err("encrypted");
  if (file.encrypted) return err("account-encrypted");
  // Without it the file is no Bitwarden export, or one whose flags were changed: never "empty"
  if (!file.items) return err("wrong-format");
  return ok(file.items.map(entryOf(byId(file.folders), byId(file.collections))));
};
