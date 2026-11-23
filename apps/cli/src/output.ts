/**
 * What the CLI prints (K-606). Titles, usernames and addresses come from entries other members
 * wrote, so a control character in them could steer the terminal (escape sequences that move the
 * cursor, rewrite a line or set the window title); they are shown as U+FFFD. A secret printed with
 * `get` goes out as stored when stdout is a pipe or a file, and with the same replacement (but its
 * line breaks and tabs kept) when stdout is a terminal.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { m } from "@kennwort/ui/messages";

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes
const CONTROL_BUT_LINES = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/** A text of an entry, safe to show on a terminal */
export const plain = (text: string) => text.replace(CONTROL, "�");

/** The secret as `get` prints it: unchanged into a pipe, without escape sequences on a terminal */
export const secretText = (value: string, toTerminal: boolean) =>
  toTerminal ? value.replace(CONTROL_BUT_LINES, "�") : value;

const vaultName = (names: ReadonlyMap<string, string | undefined>, idText: string) =>
  names.get(idText) ?? m.vaults_unnamed();

/** One hit of `search`: title, username, address, vault and ID, separated by tabs */
export const entryLine = (entry: ShownEntry, names: ReadonlyMap<string, string | undefined>) =>
  [entry.title, entry.username, entry.website, vaultName(names, entry.vault), entry.id]
    .map(plain)
    .join("\t");

/** An entry that shares its title with another: title, vault and the ID to use instead */
export const candidateLine = (entry: ShownEntry, names: ReadonlyMap<string, string | undefined>) =>
  `  ${[entry.id, entry.title, vaultName(names, entry.vault)].map(plain).join("\t")}`;

export const helpLines = () => [
  m.cli_help_usage(),
  "",
  m.cli_help_commands(),
  m.cli_help_login(),
  m.cli_help_unlock(),
  m.cli_help_lock(),
  m.cli_help_search(),
  m.cli_help_get(),
  m.cli_help_logout(),
  "",
  m.cli_help_options(),
  m.cli_help_server(),
  m.cli_help_account(),
  m.cli_help_field(),
  m.cli_help_yes(),
  m.cli_help_stdin(),
  "",
  m.cli_help_exit(),
];
