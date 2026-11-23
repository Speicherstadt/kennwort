/**
 * The command line of `kennwort` (K-606), parsed into a command or the reason it is none. There is
 * no option for the passphrase or the Secret Key: both come from the terminal without echo (or the
 * passphrase from stdin with --passphrase-stdin), never from the arguments, which other users of
 * the machine can read in the process list and which land in the shell's history. An error names
 * an option only up to its "=", so a value typed by mistake is never echoed.
 */
export type Options = {
  yes: boolean;
  passphraseStdin: boolean;
  server?: string;
  account?: string;
  field?: string;
};

export type Command =
  | { name: "help" }
  | { name: "login"; options: Options }
  | { name: "unlock"; options: Options }
  | { name: "lock" }
  | { name: "logout" }
  | { name: "search"; query: string; options: Options }
  | { name: "get"; entry: string; options: Options };

export type UsageError = {
  kind:
    | "unknown-command"
    | "unknown-option"
    | "missing-value"
    | "missing-argument"
    | "extra-argument";
  value: string;
};

export type Parsed = { ok: true; value: Command } | { ok: false; error: UsageError };

type Name = Exclude<Command["name"], "help">;
type Flag = "yes" | "passphraseStdin";
type Valued = "server" | "account" | "field";

const FLAGS: Record<string, Flag> = {
  "--yes": "yes",
  "-y": "yes",
  "--passphrase-stdin": "passphraseStdin",
};
const VALUED: Record<string, Valued> = {
  "--server": "server",
  "--account": "account",
  "--field": "field",
};

/** The options each command takes, and how many arguments: none, exactly one, or one or more words */
const COMMANDS: Record<Name, { options: readonly string[]; args: "none" | "one" | "words" }> = {
  login: { options: ["--server", "--account", "--passphrase-stdin"], args: "none" },
  unlock: { options: ["--passphrase-stdin"], args: "none" },
  lock: { options: [], args: "none" },
  logout: { options: [], args: "none" },
  search: { options: ["--passphrase-stdin"], args: "words" },
  get: { options: ["--field", "--yes", "-y", "--passphrase-stdin"], args: "one" },
};

const isName = (value: string): value is Name => Object.hasOwn(COMMANDS, value);
const fail = (kind: UsageError["kind"], value: string): Parsed => ({
  ok: false,
  error: { kind, value },
});

type Split = { ok: true; options: Options; args: string[] } | { ok: false; error: UsageError };

/** Options and arguments of one command; after "--" everything is an argument */
const split = (name: Name, rest: readonly string[]): Split => {
  const allowed = COMMANDS[name].options;
  const options: Options = { yes: false, passphraseStdin: false };
  const args: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i] ?? "";
    if (word === "--") {
      args.push(...rest.slice(i + 1));
      break;
    }
    if (!word.startsWith("-") || word === "-") {
      args.push(word);
      continue;
    }
    const [option = "", inline] = word.split(/=(.*)/s, 2);
    if (!allowed.includes(option))
      return { ok: false, error: { kind: "unknown-option", value: option } };
    const flag = FLAGS[option];
    if (flag) {
      options[flag] = true;
      continue;
    }
    const value = inline ?? rest[++i];
    if (!value) return { ok: false, error: { kind: "missing-value", value: option } };
    options[VALUED[option] as Valued] = value;
  }
  return { ok: true, options, args };
};

const commandOf = (name: Name, options: Options, args: string[]): Parsed => {
  const shape = COMMANDS[name].args;
  if (shape !== "none" && args.length === 0) return fail("missing-argument", name);
  const extra = args[shape === "one" ? 1 : 0];
  if (shape !== "words" && extra !== undefined) return fail("extra-argument", extra);
  if (name === "search") return { ok: true, value: { name, query: args.join(" "), options } };
  if (name === "get") return { ok: true, value: { name, entry: args[0] ?? "", options } };
  if (name === "lock" || name === "logout") return { ok: true, value: { name } };
  return { ok: true, value: { name, options } };
};

export const parseArgs = (argv: readonly string[]): Parsed => {
  const [first, ...rest] = argv;
  if (first === undefined || first === "help" || first === "--help" || first === "-h")
    return { ok: true, value: { name: "help" } };
  if (!isName(first)) return fail("unknown-command", first);
  const end = rest.indexOf("--");
  const own = end === -1 ? rest : rest.slice(0, end);
  if (own.includes("--help") || own.includes("-h")) return { ok: true, value: { name: "help" } };
  const parts = split(first, rest);
  return parts.ok ? commandOf(first, parts.options, parts.args) : parts;
};
