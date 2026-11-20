/**
 * Proton Pass's JSON export (`Proton Pass/data.json` inside the unencrypted ZIP): vaults by ID,
 * each with its items. Item kinds: login, alias, creditCard, note, identity, custom, sshKey, wifi;
 * own fields (`extraFields`, and `sections` of the newer kinds) are text, hidden, totp or timestamp.
 * A pinned item is a favorite, the vault becomes the folder, items in the trash (state 2) stay out.
 * The PGP-encrypted export is reported as encrypted. Source: keepassxreboot/keepassxc,
 * src/format/ProtonPassReader.cpp, and the types in Bitwarden's protonpass importer
 * (bitwarden/clients, libs/importer).
 */
import { z } from "zod";
import { err, ok } from "../result.ts";
import { custom, type DraftField, imported, joinLines, known, login } from "./entry.ts";
import { flag, list, section, text } from "./schema.ts";
import { readJson } from "./text.ts";
import type { ImportedEntry, Parser } from "./types.ts";

const ExtraField = z.object({
  fieldName: text,
  type: text,
  data: z.object({ content: text, totpUri: text, timestamp: text }).catch({
    content: "",
    totpUri: "",
    timestamp: "",
  }),
});
const Section = z.object({ sectionName: text, sectionFields: list(ExtraField) });
/** Every kind's content in one: what a kind does not have reads as empty */
const Content = section({
  itemEmail: text,
  itemUsername: text,
  password: text,
  urls: list(z.string()),
  totpUri: text,
  cardholderName: text,
  number: text,
  verificationNumber: text,
  expirationDate: text,
  pin: text,
  fullName: text,
  email: text,
  phoneNumber: text,
  organization: text,
  streetAddress: text,
  zipOrPostalCode: text,
  city: text,
  stateOrProvince: text,
  countryOrRegion: text,
  privateKey: text,
  publicKey: text,
  fingerprint: text,
  ssid: text,
  security: z.number().nullish(),
  sections: list(Section),
});
const Item = z.object({
  state: z.number().nullish(),
  pinned: flag,
  aliasEmail: text,
  data: z.object({
    type: text,
    metadata: z.object({ name: text, note: text }),
    extraFields: list(ExtraField),
    content: Content,
  }),
});
const Export = z.object({
  encrypted: flag,
  vaults: z.record(z.string(), z.object({ name: text, items: list(Item) })),
});

type Item = z.infer<typeof Item>;
type Content = z.infer<typeof Content>;
type ExtraField = z.infer<typeof ExtraField>;

const TRASHED = 2;
const WIFI_SECURITY = ["", "WPA", "WPA2", "WPA3", "WEP"];

const extraField = (field: ExtraField): DraftField => {
  if (field.type === "totp") return custom(field.fieldName, field.data.totpUri, "totp");
  if (field.type === "timestamp") return custom(field.fieldName, field.data.timestamp);
  return custom(field.fieldName, field.data.content, field.type === "hidden" ? "secret" : "text");
};

const ownFields = (item: Item): DraftField[] =>
  [...item.data.extraFields, ...item.data.content.sections.flatMap((s) => s.sectionFields)].map(
    extraField,
  );

/** Proton writes the expiry as YYYY-MM */
const cardExpiry = (value: string) => value.replace(/^(\d{4})-(\d{2})$/, "$2/$1");

const KINDS = new Map<
  string,
  { type: ImportedEntry["content"]["type"]; fields: (c: Content) => DraftField[] }
>([
  [
    "creditCard",
    {
      type: "card",
      fields: (c) => [
        known("holder", c.cardholderName),
        known("number", c.number),
        known("expiry", cardExpiry(c.expirationDate)),
        known("cvc", c.verificationNumber),
        known("pin", c.pin),
      ],
    },
  ],
  [
    "identity",
    {
      type: "identity",
      fields: (c) => [
        known("name", c.fullName),
        known("email", c.email),
        known("phone", c.phoneNumber),
        known(
          "address",
          joinLines(
            c.organization,
            c.streetAddress,
            `${c.zipOrPostalCode} ${c.city}`,
            c.stateOrProvince,
            c.countryOrRegion,
          ),
        ),
      ],
    },
  ],
  [
    "sshKey",
    {
      type: "ssh-key",
      fields: (c) => [
        known("private-key", c.privateKey),
        known("public-key", c.publicKey),
        custom("Fingerprint", c.fingerprint),
      ],
    },
  ],
  [
    "wifi",
    {
      type: "wifi",
      fields: (c) => [
        known("ssid", c.ssid),
        known("password", c.password),
        known("security", WIFI_SECURITY[c.security ?? 0] ?? ""),
      ],
    },
  ],
]);

const entryOf =
  (vault: string) =>
  (item: Item): ImportedEntry => {
    const { data } = item;
    const base = {
      title: data.metadata.name,
      notes: data.metadata.note,
      favorite: item.pinned,
      folders: [vault],
    };
    const kind = KINDS.get(data.type);
    if (kind)
      return imported({
        ...base,
        type: kind.type,
        fields: [...kind.fields(data.content), ...ownFields(item)],
      });
    if (data.type !== "login") {
      const alias = custom("Alias", item.aliasEmail, "email");
      return imported({ ...base, type: "note", fields: [alias, ...ownFields(item)] });
    }
    const { content } = data;
    const email = content.itemUsername === "" ? [] : [custom("Email", content.itemEmail, "email")];
    return login({
      ...base,
      username: content.itemUsername || content.itemEmail,
      password: content.password,
      urls: content.urls,
      totp: content.totpUri,
      fields: [...email, ...ownFields(item)],
    });
  };

export const parseProtonPassJson: Parser = (input) => {
  const json = readJson(input, Export);
  if (!json.ok) return json;
  if (json.value.encrypted) return err("encrypted");
  const vaults = Object.values(json.value.vaults);
  return ok(
    vaults.flatMap((vault) =>
      vault.items.filter((item) => item.state !== TRASHED).map(entryOf(vault.name)),
    ),
  );
};
