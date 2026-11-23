#!/usr/bin/env bun
/**
 * `kennwort`, the command line of Kennwort (K-606): the edges only. The language from the locale
 * settings, the device file under XDG_CONFIG_HOME, the terminal and the network; everything else
 * is in commands.ts and takes these as values.
 */
import { homedir } from "node:os";
import { randomBytes } from "@kennwort/crypto";
import { withAccount } from "./account.ts";
import { parseArgs } from "./args.ts";
import { run } from "./commands.ts";
import { devicePath, statePath } from "./device-file.ts";
import { describeFailure, exitOf } from "./failure.ts";
import { localeOf, useLocale } from "./locale.ts";
import { stateKeeper } from "./state-file.ts";
import { askOn, readAll } from "./terminal.ts";

const main = async (): Promise<number> => {
  useLocale(localeOf(process.env));
  const err = (line: string) => process.stderr.write(`${line}\n`);
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    const failure = { code: "usage", usage: parsed.error } as const;
    for (const line of describeFailure(failure)) err(line);
    return exitOf(failure);
  }
  const path = devicePath(process.env, homedir());
  return run(parsed.value, {
    io: {
      out: (line) => process.stdout.write(`${line}\n`),
      err,
      ask: askOn(process.stdin, process.stderr),
      stdin: async () => (process.stdin.isTTY ? undefined : readAll(process.stdin)),
      stdoutIsTerminal: Boolean(process.stdout.isTTY),
    },
    devicePath: path,
    connection: { send: fetch, platform: process.platform, kept: stateKeeper(statePath(path)) },
    now: Date.now,
    random: randomBytes,
    open: withAccount,
  });
};

// A reader that stops early (`kennwort search x | head -1`) ends the output, not with a stack trace
process.stdout.on("error", () => process.exit(process.exitCode ?? 0));
process.exitCode = await main();
