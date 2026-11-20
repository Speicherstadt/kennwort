/**
 * The kinds of entries and their fields (K-306 part 2): every type brings fixed fields with fixed
 * IDs, so the app finds them whatever name another device stored; their labels come from the
 * app's language when shown. Fields beyond these are the owner's own.
 */
import type { EntryContent } from "@kennwort/core";
import { m } from "@kennwort/ui";

export type EntryType = EntryContent["type"];
export type FieldKindChoice = "text" | "secret" | "url" | "email" | "note" | "totp";
export type TemplateField = { id: string; kind: FieldKindChoice; label: () => string };

export const ENTRY_TYPES: readonly EntryType[] = [
  "login",
  "note",
  "wifi",
  "card",
  "ssh-key",
  "api-key",
  "identity",
];

const field = (id: string, kind: FieldKindChoice, label: () => string): TemplateField => ({
  id,
  kind,
  label,
});

export const TEMPLATES: Record<EntryType, readonly TemplateField[]> = {
  login: [
    field("username", "text", m.field_username),
    field("password", "secret", m.field_password),
    field("website", "url", m.field_website),
    field("totp", "totp", m.field_totp),
  ],
  note: [field("note", "note", m.field_note)],
  wifi: [
    field("ssid", "text", m.field_ssid),
    field("password", "secret", m.field_password),
    field("security", "text", m.field_security),
  ],
  card: [
    field("holder", "text", m.field_holder),
    field("number", "secret", m.field_card_number),
    field("expiry", "text", m.field_expiry),
    field("cvc", "secret", m.field_cvc),
    field("pin", "secret", m.field_pin),
  ],
  "ssh-key": [
    field("private-key", "secret", m.field_private_key),
    field("public-key", "note", m.field_public_key),
    field("passphrase", "secret", m.field_passphrase),
  ],
  "api-key": [field("key", "secret", m.field_api_key), field("website", "url", m.field_endpoint)],
  identity: [
    field("name", "text", m.field_name),
    field("email", "email", m.field_email),
    field("phone", "text", m.field_phone),
    field("address", "note", m.field_address),
  ],
};

export const typeLabel = (type: EntryType): string =>
  ({
    login: m.type_login,
    note: m.type_note,
    wifi: m.type_wifi,
    card: m.type_card,
    "ssh-key": m.type_ssh_key,
    "api-key": m.type_api_key,
    identity: m.type_identity,
  })[type]();

const KIND_LABELS: Record<FieldKindChoice, () => string> = {
  text: m.kind_text,
  secret: m.kind_secret,
  url: m.kind_url,
  email: m.kind_email,
  note: m.kind_note,
  totp: m.kind_totp,
};

/** The label of a field kind; one this app does not offer (another app's) by its own name */
export const kindLabel = (kind: string): string => KIND_LABELS[kind as FieldKindChoice]?.() ?? kind;

export const CUSTOM_KINDS: readonly FieldKindChoice[] = [
  "text",
  "secret",
  "url",
  "email",
  "note",
  "totp",
];

/** The template field of a type with this ID, if it is one */
export const templateField = (type: EntryType, id: string) =>
  TEMPLATES[type].find((f) => f.id === id);

/** The label of a field: the app's own for a template field, the stored name for the owner's own */
export const labelOf = (content: EntryContent, f: EntryContent["fields"][number]) =>
  templateField(content.type, f.id)?.label() ?? f.name;
