import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.ts";

const defaults = { yes: false, passphraseStdin: false };

describe("the command line", () => {
  it.each([[[]], [["help"]], [["--help"]], [["-h"]], [["search", "--help"]]])(
    "asks for the help with %j",
    (argv) => {
      expect(parseArgs(argv)).toEqual({ ok: true, value: { name: "help" } });
    },
  );

  it("reads login with server and account, in both spellings of an option's value", () => {
    expect(
      parseArgs(["login", "--server", "https://kennwort.weber.test", "--account=AAAA"]),
    ).toEqual({
      ok: true,
      value: {
        name: "login",
        options: { ...defaults, server: "https://kennwort.weber.test", account: "AAAA" },
      },
    });
  });

  it("reads search with a query of several words", () => {
    expect(parseArgs(["search", "Heizung", "Büro"])).toEqual({
      ok: true,
      value: { name: "search", query: "Heizung Büro", options: defaults },
    });
  });

  it("reads get with a field, --yes and the passphrase from stdin", () => {
    expect(parseArgs(["get", "DATEV", "--field", "username", "-y", "--passphrase-stdin"])).toEqual({
      ok: true,
      value: {
        name: "get",
        entry: "DATEV",
        options: { yes: true, passphraseStdin: true, field: "username" },
      },
    });
  });

  it.each(["unlock", "lock", "logout"])("reads %s without arguments", (name) => {
    const parsed = parseArgs([name]);
    expect(parsed.ok && parsed.value.name).toBe(name);
  });

  it("names an unknown command", () => {
    expect(parseArgs(["show"])).toEqual({
      ok: false,
      error: { kind: "unknown-command", value: "show" },
    });
  });

  it("never echoes what follows = in an unknown option: a passphrase is no argument", () => {
    const parsed = parseArgs(["unlock", "--passphrase=Heizung-Wasser-Licht-Kupfer"]);
    expect(parsed).toEqual({ ok: false, error: { kind: "unknown-option", value: "--passphrase" } });
    expect(JSON.stringify(parsed)).not.toContain("Heizung");
  });

  it("refuses an option the command does not take", () => {
    expect(parseArgs(["search", "x", "--yes"])).toEqual({
      ok: false,
      error: { kind: "unknown-option", value: "--yes" },
    });
    expect(parseArgs(["login", "--field", "password"])).toEqual({
      ok: false,
      error: { kind: "unknown-option", value: "--field" },
    });
  });

  it("wants a value after an option that takes one", () => {
    expect(parseArgs(["get", "DATEV", "--field"])).toEqual({
      ok: false,
      error: { kind: "missing-value", value: "--field" },
    });
    expect(parseArgs(["login", "--server="])).toEqual({
      ok: false,
      error: { kind: "missing-value", value: "--server" },
    });
  });

  it("wants the query and the entry", () => {
    expect(parseArgs(["search"])).toEqual({
      ok: false,
      error: { kind: "missing-argument", value: "search" },
    });
    expect(parseArgs(["get"])).toEqual({
      ok: false,
      error: { kind: "missing-argument", value: "get" },
    });
  });

  it("refuses arguments a command does not take", () => {
    expect(parseArgs(["lock", "now"])).toEqual({
      ok: false,
      error: { kind: "extra-argument", value: "now" },
    });
    expect(parseArgs(["get", "DATEV", "Lexware"])).toEqual({
      ok: false,
      error: { kind: "extra-argument", value: "Lexware" },
    });
  });

  it("takes everything after -- as arguments", () => {
    expect(parseArgs(["get", "--", "--yes"])).toEqual({
      ok: true,
      value: { name: "get", entry: "--yes", options: defaults },
    });
    expect(parseArgs(["search", "--", "-h"])).toEqual({
      ok: true,
      value: { name: "search", query: "-h", options: defaults },
    });
  });
});
