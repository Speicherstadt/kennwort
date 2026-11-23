/**
 * The commands of `kennwort` (K-606). Each one ends with nothing or a Failure (failure.ts), which
 * run() turns into lines on stderr and an exit code. A command that reads the vault unlocks for
 * itself and locks again before it ends (account.ts): no unlocked key outlives the process, and
 * `lock` has nothing to do. Only `get` prints a secret, and only after a confirmation typed on the
 * terminal or --yes; a refused confirmation prints nothing on stdout.
 */
import { serverOrigin } from "@kennwort/client/session/server-url.ts";
import { bytes } from "@kennwort/core";
import { parseSecretKey } from "@kennwort/crypto";
import { m } from "@kennwort/ui/messages";
import type { AccountError, Connection, Loaded, withAccount } from "./account.ts";
import type { Command, Options } from "./args.ts";
import { type Device, readDevice, removeDevice, writeDevice } from "./device-file.ts";
import { describeFailure, EXIT, exitOf, type Failure } from "./failure.ts";
import { findEntry, pickField, readField, searchEntries } from "./find.ts";
import { entryLine, helpLines, plain, secretText } from "./output.ts";
import { type Answer, firstLine } from "./terminal.ts";

export type Io = {
  out: (line: string) => void;
  err: (line: string) => void;
  ask: (prompt: string, echo: boolean) => Promise<Answer>;
  /** Everything on stdin, for --passphrase-stdin; undefined when stdin is the terminal */
  stdin: () => Promise<string | undefined>;
  stdoutIsTerminal: boolean;
};

export type CliDeps = {
  io: Io;
  devicePath: string;
  connection: Connection;
  now: () => number;
  random: (length: number) => Uint8Array;
  open: typeof withAccount;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };
const failed = <T>(error: Failure): Result<T> => ({ ok: false, error });

const asked = async (deps: CliDeps, prompt: string, echo: boolean): Promise<Result<string>> => {
  const answer = await deps.io.ask(prompt, echo);
  return answer.ok ? answer : failed({ code: answer.error });
};

/**
 * From stdin with --passphrase-stdin, else typed on the terminal without echo. When stdin is the
 * terminal itself, --passphrase-stdin asks without echo as well: read as plain input, the terminal
 * would show the passphrase as it is typed.
 */
const passphraseOf = async (options: Options, deps: CliDeps): Promise<Result<string>> => {
  const piped = options.passphraseStdin ? await deps.io.stdin() : undefined;
  if (piped === undefined) return asked(deps, m.cli_prompt_passphrase(), false);
  const line = firstLine(piped);
  return line ? { ok: true, value: line } : failed({ code: "no-terminal" });
};

const knownDevice = (deps: CliDeps): Result<Device> => {
  const read = readDevice(deps.devicePath);
  if (!read.ok) return failed({ code: read.error, path: deps.devicePath });
  return read.value ? { ok: true, value: read.value } : failed({ code: "not-logged-in" });
};

const accountFailure = (error: AccountError): Failure => ({
  code:
    error === "wrong-passphrase" ||
    error === "too-many-requests" ||
    error === "unreachable" ||
    error === "untrusted"
      ? error
      : "unexpected",
});

/** Unlocks, loads and checks; the warnings about what failed the check go to stderr */
const opened = async (device: Device, options: Options, deps: CliDeps): Promise<Result<Loaded>> => {
  const passphrase = await passphraseOf(options, deps);
  if (!passphrase.ok) return passphrase;
  const loaded = await deps.open(device, passphrase.value, deps.connection);
  if (!loaded.ok) return failed(accountFailure(loaded.error));
  const { refusedVaults, refusedEntries } = loaded.value;
  if (refusedVaults > 0) deps.io.err(m.cli_refused_vaults({ count: refusedVaults }));
  if (refusedEntries > 0) deps.io.err(m.cli_refused_entries({ count: refusedEntries }));
  return loaded;
};

const openKnown = async (options: Options, deps: CliDeps) => {
  const device = knownDevice(deps);
  return device.ok ? opened(device.value, options, deps) : device;
};

const vaultCount = (loaded: Loaded) => loaded.vaultNames.size;

/** The value given as an option, else asked on the terminal with echo */
const given = (
  value: string | undefined,
  prompt: string,
  deps: CliDeps,
): Promise<Result<string>> =>
  value === undefined ? asked(deps, prompt, true) : Promise.resolve({ ok: true, value });

/** The server and account as the recovery kit shows them, the Secret Key without echo */
const typedDevice = async (options: Options, deps: CliDeps): Promise<Result<Device>> => {
  const server = await given(options.server, m.cli_prompt_server(), deps);
  if (!server.ok) return server;
  const origin = serverOrigin(server.value);
  if (!origin.ok) return failed({ code: origin.error });
  const account = await given(options.account, m.cli_prompt_account(), deps);
  if (!account.ok) return account;
  const secret = await asked(deps, m.cli_prompt_secret_key(), false);
  if (!secret.ok) return secret;
  const accountId = bytes(16).safeParse(account.value.trim());
  const secretKey = parseSecretKey(secret.value.trim());
  if (!accountId.success || !secretKey.ok) return failed({ code: "invalid-account" });
  const deviceId = deps.random(16);
  return {
    ok: true,
    value: {
      server: origin.value,
      accountId: accountId.data,
      secretKey: secretKey.value,
      deviceId,
    },
  };
};

const login = async (options: Options, deps: CliDeps): Promise<Failure | undefined> => {
  const device = await typedDevice(options, deps);
  if (!device.ok) return device.error;
  const loaded = await opened(device.value, options, deps);
  if (!loaded.ok) return loaded.error;
  if (!writeDevice(deps.devicePath, device.value))
    return { code: "storage-failed", path: deps.devicePath };
  const { server } = device.value;
  deps.io.out(
    m.cli_logged_in({
      server,
      vaults: vaultCount(loaded.value),
      entries: loaded.value.entries.length,
    }),
  );
};

const unlock = async (options: Options, deps: CliDeps): Promise<Failure | undefined> => {
  const loaded = await openKnown(options, deps);
  if (!loaded.ok) return loaded.error;
  const counts = { vaults: vaultCount(loaded.value), entries: loaded.value.entries.length };
  deps.io.out(m.cli_unlocked(counts));
};

const search = async (query: string, options: Options, deps: CliDeps) => {
  const loaded = await openKnown(options, deps);
  if (!loaded.ok) return loaded.error;
  const hits = searchEntries(loaded.value.entries, query);
  if (hits.length === 0) return { code: "no-matches" } satisfies Failure;
  for (const hit of hits) deps.io.out(entryLine(hit, loaded.value.vaultNames));
};

const confirmed = async (field: string, title: string, deps: CliDeps): Promise<Result<true>> => {
  const answer = await asked(
    deps,
    m.cli_confirm({ field: plain(field), title: plain(title) }),
    true,
  );
  if (!answer.ok) return answer;
  const yes = m.cli_confirm_answers().split(",");
  return yes.includes(answer.value.trim().toLocaleLowerCase())
    ? { ok: true, value: true }
    : failed({ code: "not-confirmed" });
};

const get = async (ref: string, options: Options, deps: CliDeps): Promise<Failure | undefined> => {
  const loaded = await openKnown(options, deps);
  if (!loaded.ok) return loaded.error;
  const found = findEntry(loaded.value.entries, ref);
  if (!found.ok)
    return found.error === "ambiguous"
      ? {
          code: "ambiguous",
          value: ref,
          candidates: found.candidates,
          vaultNames: loaded.value.vaultNames,
        }
      : { code: "not-found", value: ref };
  const picked = pickField(found.value, options.field);
  if (!picked.ok) return { code: "no-field", value: options.field ?? "", fields: picked.fields };
  const value = readField(picked.value, deps.now());
  if (!value.ok) return { code: value.error };
  if (!options.yes) {
    const yes = await confirmed(picked.value.label, found.value.title, deps);
    if (!yes.ok) return yes.error;
  }
  deps.io.out(secretText(value.value, deps.io.stdoutIsTerminal));
};

const execute = async (command: Command, deps: CliDeps): Promise<Failure | undefined> => {
  switch (command.name) {
    case "help":
      for (const line of helpLines()) deps.io.out(line);
      return;
    case "login":
      return login(command.options, deps);
    case "unlock":
      return unlock(command.options, deps);
    case "lock":
      deps.io.out(m.cli_locked());
      return;
    case "logout":
      if (!removeDevice(deps.devicePath)) return { code: "logout-failed", path: deps.devicePath };
      deps.io.out(m.cli_logged_out());
      return;
    case "search":
      return search(command.query, command.options, deps);
    case "get":
      return get(command.entry, command.options, deps);
  }
};

/** Runs one command; gives the exit code (failure.ts, EXIT) */
export const run = async (command: Command, deps: CliDeps): Promise<number> => {
  const failure = await execute(command, deps);
  if (!failure) return EXIT.ok;
  for (const line of describeFailure(failure)) deps.io.err(line);
  return exitOf(failure);
};
