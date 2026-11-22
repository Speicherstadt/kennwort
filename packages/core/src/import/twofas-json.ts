/**
 * 2FAS's backup (Settings → 2FAS Backup → Export to file, a `.2fas` file of JSON): `services`
 * with a `name` (the service), the Base32 `secret`, a `groupId` and `otp` with `account`,
 * `issuer`, `digits`, `period`, `algorithm` and `tokenType` (`TOTP`, `HOTP`, `STEAM`; older
 * backups leave it out for TOTP), and `groups` with `id` and `name`. A backup with a password
 * keeps its services in `servicesEncrypted` and leaves `services` empty. Source: BackupContent.kt,
 * BackupService.kt and BackupGroup.kt in twofas/2fas-android, TwoFASImporter.java and its test
 * data in beemdevelopment/Aegis.
 */
import { z } from "zod";
import { err } from "../result.ts";
import { fromBase32, otpEntry, withSkipped } from "./authenticator.ts";
import { list, text } from "./schema.ts";
import { readJson } from "./text.ts";
import type { ImportedEntry, Parser } from "./types.ts";

const Service = z.object({
  name: text,
  secret: text,
  groupId: text,
  otp: z.object({
    account: text,
    issuer: text,
    digits: z.number().nullish(),
    period: z.number().nullish(),
    algorithm: text,
    tokenType: text,
  }),
});
const Group = z.object({ id: z.string(), name: text });
const Backup = z.object({
  schemaVersion: z.number(),
  services: z.array(Service),
  groups: list(Group),
  servicesEncrypted: text,
});

type Service = z.infer<typeof Service>;

/** 2FAS's defaults, as Aegis's importer reads a service without them */
const DEFAULTS = { digits: 6, period: 30, algorithm: "SHA1" }; // i18n-ignore: algorithm name in the vendor's format

const entryOf =
  (groups: Map<string, string>) =>
  (service: Service): ImportedEntry | undefined => {
    const otp = service.otp;
    if (otp.tokenType !== "" && otp.tokenType !== "TOTP") return undefined;
    return otpEntry({
      issuer: service.name || otp.issuer,
      account: otp.account,
      secret: fromBase32(service.secret),
      algorithm: otp.algorithm || DEFAULTS.algorithm,
      digits: otp.digits ?? DEFAULTS.digits,
      period: otp.period ?? DEFAULTS.period,
      folders: [groups.get(service.groupId) ?? ""],
    });
  };

export const parseTwoFasJson: Parser = (input) => {
  const json = readJson(input, Backup);
  if (!json.ok) return json;
  if (json.value.servicesEncrypted !== "") return err("encrypted");
  const groups = new Map(json.value.groups.map((group) => [group.id, group.name]));
  return withSkipped(json.value.services.map(entryOf(groups)));
};
