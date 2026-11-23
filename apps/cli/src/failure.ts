/**
 * Why a command did not do what it was asked (K-606), as a value: every command ends with nothing
 * or one of these, which main.ts turns into lines on stderr and an exit code. A failure carries
 * only what may be shown: names of options, IDs, titles and paths, never a passphrase or a secret.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import type { ServerError } from "@kennwort/client/session/server-url.ts";
import { m } from "@kennwort/ui/messages";
import type { AccountError } from "./account.ts";
import type { UsageError } from "./args.ts";
import type { DeviceFileError } from "./device-file.ts";
import { candidateLine, plain } from "./output.ts";

type PathCode = DeviceFileError | "storage-failed" | "logout-failed";

export type Failure =
  | { code: "usage"; usage: UsageError }
  | {
      code:
        | AccountError
        | ServerError
        | "invalid-account"
        | "not-logged-in"
        | "no-terminal"
        | "cancelled"
        | "not-confirmed"
        | "no-matches"
        | "empty-field"
        | "invalid-totp";
    }
  | { code: PathCode; path: string }
  | { code: "not-found"; value: string }
  | {
      code: "ambiguous";
      value: string;
      candidates: ShownEntry[];
      vaultNames: ReadonlyMap<string, string | undefined>;
    }
  | { code: "no-field"; value: string; fields: string[] };

/** 0 done, 1 error, 2 wrong usage, 3 not confirmed, 4 not found (docs/cli.md) */
export const EXIT = { ok: 0, failed: 1, usage: 2, notConfirmed: 3, notFound: 4 } as const;

const NOT_FOUND = new Set<Failure["code"]>(["no-matches", "not-found", "ambiguous", "no-field"]);

export const exitOf = (failure: Failure): number =>
  failure.code === "usage"
    ? EXIT.usage
    : failure.code === "not-confirmed" || failure.code === "cancelled"
      ? EXIT.notConfirmed
      : NOT_FOUND.has(failure.code)
        ? EXIT.notFound
        : EXIT.failed;

const USAGE: Record<UsageError["kind"], (inputs: { value: string }) => string> = {
  "unknown-command": m.cli_error_unknown_command,
  "unknown-option": m.cli_error_unknown_option,
  "missing-value": m.cli_error_missing_value,
  "missing-argument": m.cli_error_missing_argument,
  "extra-argument": m.cli_error_extra_argument,
};

const SIMPLE: Partial<Record<Failure["code"], () => string>> = {
  "wrong-passphrase": m.cli_error_wrong_passphrase,
  "too-many-requests": m.cli_error_too_many_requests,
  unreachable: m.cli_error_unreachable,
  untrusted: m.cli_error_untrusted,
  "invalid-server": m.cli_error_invalid_server,
  "insecure-server": m.cli_error_insecure_server,
  "invalid-account": m.cli_error_invalid_account,
  "not-logged-in": m.cli_error_not_logged_in,
  "no-terminal": m.cli_error_no_terminal,
  cancelled: m.cli_error_cancelled,
  "not-confirmed": m.cli_not_confirmed,
  "no-matches": m.cli_error_no_matches,
  "empty-field": m.cli_error_empty_field,
  "invalid-totp": m.cli_error_invalid_totp,
};

const WITH_PATH: Record<PathCode, (inputs: { path: string }) => string> = {
  "insecure-device-file": m.cli_error_insecure_device_file,
  "damaged-device-file": m.cli_error_damaged_device_file,
  "storage-failed": m.cli_error_storage_failed,
  "logout-failed": m.cli_error_logout_failed,
};

/** The lines that say why, in the language of the locale (locale.ts) */
export const describeFailure = (failure: Failure): string[] => {
  switch (failure.code) {
    case "usage":
      return [USAGE[failure.usage.kind]({ value: plain(failure.usage.value) })];
    case "not-found":
      return [m.cli_error_not_found({ value: plain(failure.value) })];
    case "ambiguous":
      return [
        m.cli_error_ambiguous({ value: plain(failure.value) }),
        ...failure.candidates.map((entry) => candidateLine(entry, failure.vaultNames)),
      ];
    case "no-field":
      return [
        m.cli_error_no_field({
          value: plain(failure.value),
          fields: plain(failure.fields.join(", ")),
        }),
      ];
    default:
      return "path" in failure
        ? [WITH_PATH[failure.code]({ path: plain(failure.path) })]
        : [(SIMPLE[failure.code] ?? m.cli_error_unexpected)()];
  }
};
