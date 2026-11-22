/**
 * Aegis's vault export (Settings → Import & Export → Export, plain JSON): `header` with the
 * key slots, which are null for a plain export, and `db` with the entries and groups; in an
 * encrypted export `db` is a Base64 string. Each entry has a `type` (`totp`, `hotp`, `steam`,
 * `motp`, `yandex`), `name` (the account), `issuer`, `note`, `favorite`, the group UUIDs (older
 * vaults: one group name in `group`) and `info` with the Base32 `secret`, `algo`, `digits` and
 * `period`. Source: docs/vault.md, AegisImporter.java and VaultEntry.java in
 * beemdevelopment/Aegis.
 */
import { z } from "zod";
import { err } from "../result.ts";
import { fromBase32, otpEntry, withSkipped } from "./authenticator.ts";
import { flag, list, text } from "./schema.ts";
import { readJson } from "./text.ts";
import type { ImportedEntry, Parser } from "./types.ts";

const Entry = z.object({
  type: text,
  name: text,
  issuer: text,
  note: text,
  favorite: flag,
  groups: list(z.string()),
  group: text,
  info: z.object({
    secret: text,
    algo: text,
    digits: z.number().nullish(),
    period: z.number().nullish(),
  }),
});
const Group = z.object({ uuid: z.string(), name: text });
const Db = z.object({ entries: z.array(Entry), groups: list(Group) });
const Vault = z.object({
  version: z.number(),
  header: z.object({}),
  db: z.union([z.string(), Db]),
});

type Entry = z.infer<typeof Entry>;

/** Aegis's defaults (TotpInfo.java) for a field the entry leaves out */
const DIGITS = 6;
const PERIOD = 30;

const entryOf =
  (groups: Map<string, string>) =>
  (entry: Entry): ImportedEntry | undefined =>
    entry.type === "totp"
      ? otpEntry({
          issuer: entry.issuer,
          account: entry.name,
          secret: fromBase32(entry.info.secret),
          algorithm: entry.info.algo || "SHA1", // i18n-ignore: algorithm name in the vendor's format
          digits: entry.info.digits ?? DIGITS,
          period: entry.info.period ?? PERIOD,
          notes: entry.note,
          favorite: entry.favorite,
          folders: [...entry.groups.map((uuid) => groups.get(uuid) ?? ""), entry.group],
        })
      : undefined;

export const parseAegisJson: Parser = (input) => {
  const json = readJson(input, Vault);
  if (!json.ok) return json;
  const db = json.value.db;
  if (typeof db === "string") return err("encrypted");
  const groups = new Map(db.groups.map((group) => [group.uuid, group.name]));
  return withSkipped(db.entries.map(entryOf(groups)));
};
