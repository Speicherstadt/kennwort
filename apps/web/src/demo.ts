/**
 * The entries the frame shows until it reads the real ones (K-303 to K-306): Weber Haustechnik as
 * in DESIGN.md, Testdaten. Data, not texts: it lives in demo.json, names stay as a company typed them.
 */
import { m } from "@kennwort/ui";
import data from "./demo.json";
import { type ShownEntry, subtitleOf } from "./entries/entries.ts";

export type DemoEntry = ShownEntry;

export const company: { name: string; user: string } = data.company;
export const vaults: { id: string; name: string }[] = data.vaults;
export const groups: { id: string; name: string; members: number }[] = data.groups;
/** A field whose label follows the app's language, read when shown, not when this module loads */
const field = (
  id: string,
  label: () => string,
  value: string,
  kind: DemoEntry["fields"][number]["kind"],
) => ({
  id,
  get label() {
    return label();
  },
  value,
  kind,
});

/** The demo's logins in the shape of the real entries: type and fields */
export const entries: DemoEntry[] = data.entries.map((entry) => {
  const fields: DemoEntry["fields"] = [
    field("username", m.field_username, entry.username, "text"),
    field("password", m.field_password, entry.password, "secret"),
    field("website", m.field_website, entry.website, "url"),
  ];
  return {
    ...entry,
    type: "login",
    fields,
    subtitle: subtitleOf(fields),
    tags: [],
    history: [],
    reused: 0,
  };
});

export const vaultName = (id: string) => vaults.find((vault) => vault.id === id)?.name ?? id;
