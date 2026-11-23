import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ShownEntry, ShownField } from "@kennwort/client/entries/entries.ts";
import { encodeBytes } from "@kennwort/core";
import { formatSecretKey } from "@kennwort/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Loaded, withAccount } from "./account.ts";
import { type Command, parseArgs } from "./args.ts";
import { type CliDeps, run } from "./commands.ts";
import { type Device, readDevice, writeDevice } from "./device-file.ts";
import { useLocale } from "./locale.ts";
import type { Answer } from "./terminal.ts";

const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";
const PASSWORD = "Kupfer-Rohr-42";
const SERVER = "https://kennwort.weber-haustechnik.test";

const field = (id: string, kind: ShownField["kind"], value: string): ShownField => ({
  id,
  label: id === "password" ? "Passwort" : id,
  kind,
  value,
});
const datev: ShownEntry = {
  id: "id-datev",
  type: "login",
  title: "DATEV",
  subtitle: "",
  fields: [
    field("username", "text", "anna@weber-haustechnik.de"),
    field("password", "secret", PASSWORD),
    field("website", "url", "https://www.datev.de"),
  ],
  username: "anna@weber-haustechnik.de",
  password: PASSWORD,
  website: "https://www.datev.de",
  vault: "vault-buero",
  favorite: false,
  tags: [],
  history: [],
  weak: false,
  reused: 0,
  changedAt: 0,
  changedBy: "",
  access: [],
};
const loaded: Loaded = {
  entries: [datev],
  vaultNames: new Map([["vault-buero", "Büro"]]),
  refusedVaults: 0,
  refusedEntries: 0,
};
const device: Device = {
  server: SERVER,
  accountId: new Uint8Array(16).fill(7),
  secretKey: new Uint8Array(16).fill(9),
  deviceId: new Uint8Array(16).fill(3),
};

type Harness = { deps: CliDeps; out: string[]; err: string[]; prompts: string[] };

/** The CLI with a scripted terminal: each question takes the next answer */
const harness = (answers: Answer[], overrides: Partial<CliDeps> = {}): Harness => {
  const out: string[] = [];
  const err: string[] = [];
  const prompts: string[] = [];
  const open: typeof withAccount = async (_device, passphrase) =>
    passphrase === PASSPHRASE
      ? { ok: true, value: loaded }
      : { ok: false, error: "wrong-passphrase" };
  const deps: CliDeps = {
    io: {
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      ask: async (prompt) => {
        prompts.push(prompt);
        return answers.shift() ?? { ok: false, error: "no-terminal" };
      },
      stdin: async () => undefined,
      stdoutIsTerminal: false,
    },
    devicePath: join(mkdtempSync(join(tmpdir(), "kennwort-cli-")), "kennwort", "device.json"),
    connection: {
      send: fetch,
      platform: "linux",
      kept: { read: () => undefined, keep: () => true },
    },
    now: () => 0,
    random: (length) => new Uint8Array(length).fill(3),
    open,
    ...overrides,
  };
  return { deps, out, err, prompts };
};

const typed = (value: string): Answer => ({ ok: true, value });
const command = (...argv: string[]): Command => {
  const parsed = parseArgs(argv);
  if (!parsed.ok) throw new Error(parsed.error.kind);
  return parsed.value;
};
const everything = (h: Harness) => [...h.out, ...h.err, ...h.prompts].join("\n");

beforeEach(() => {
  useLocale("de");
});

describe("kennwort login", () => {
  it("checks the account with the server, then keeps the device for the owner only", async () => {
    const h = harness([
      typed(SERVER),
      typed(encodeBytes(device.accountId)),
      typed(formatSecretKey(device.secretKey)),
      typed(PASSPHRASE),
    ]);
    expect(await run(command("login"), h.deps)).toBe(0);
    expect(readDevice(h.deps.devicePath)).toEqual({ ok: true, value: device });
    expect(statSync(h.deps.devicePath).mode & 0o777).toBe(0o600);
    expect(h.out).toEqual([`Angemeldet bei ${SERVER}. Tresore: 1, Einträge: 1.`]);
    expect(h.prompts).toEqual(["Server: ", "Konto-ID: ", "Secret Key: ", "Passphrase: "]);
  });

  it("takes server and account from the options and asks only for the secrets", async () => {
    const h = harness([typed(formatSecretKey(device.secretKey)), typed(PASSPHRASE)]);
    const login = command("login", "--server", SERVER, "--account", encodeBytes(device.accountId));
    expect(await run(login, h.deps)).toBe(0);
    expect(h.prompts).toEqual(["Secret Key: ", "Passphrase: "]);
  });

  it("keeps nothing when the passphrase is wrong, and never echoes it", async () => {
    const h = harness([
      typed(SERVER),
      typed(encodeBytes(device.accountId)),
      typed(formatSecretKey(device.secretKey)),
      typed("falsch-falsch"),
    ]);
    expect(await run(command("login"), h.deps)).toBe(1);
    expect(readDevice(h.deps.devicePath)).toEqual({ ok: true, value: undefined });
    expect(h.err).toEqual(["Passphrase, Konto-ID oder Secret Key stimmen nicht."]);
    expect(everything(h)).not.toContain("falsch-falsch");
  });

  it("refuses plain HTTP to another machine before asking for any secret", async () => {
    const h = harness([typed("http://kennwort.weber-haustechnik.test")]);
    expect(await run(command("login"), h.deps)).toBe(1);
    expect(h.prompts).toEqual(["Server: "]);
    expect(h.err).toEqual(["Nur über HTTPS; http geht nur für localhost."]);
  });

  it("refuses an account ID or Secret Key of the wrong form before asking for the passphrase", async () => {
    const h = harness([typed(SERVER), typed("Jonas"), typed("A3-XXXX")]);
    expect(await run(command("login"), h.deps)).toBe(1);
    expect(h.prompts).not.toContain("Passphrase: ");
  });

  it("stops when the typing is cancelled", async () => {
    const h = harness([typed(SERVER), { ok: false, error: "cancelled" }]);
    expect(await run(command("login"), h.deps)).toBe(3);
    expect(h.err).toEqual(["Abgebrochen."]);
  });
});

describe("kennwort search", () => {
  it("prints title, username, address, vault and ID of each hit, never a secret", async () => {
    const h = harness([typed(PASSPHRASE)]);
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("search", "datev"), h.deps)).toBe(0);
    expect(h.out).toEqual([
      "DATEV\tanna@weber-haustechnik.de\thttps://www.datev.de\tBüro\tid-datev",
    ]);
    expect(everything(h)).not.toContain(PASSWORD);
  });

  it("says so and ends with 4 when nothing matches", async () => {
    const h = harness([typed(PASSPHRASE)]);
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("search", "Lexware"), h.deps)).toBe(4);
    expect(h.err).toEqual(["Keine Treffer."]);
  });

  it("shows control characters in titles as U+FFFD, so an entry cannot steer the terminal", async () => {
    const h = harness([typed(PASSPHRASE)], {
      open: async () => ({
        ok: true,
        value: { ...loaded, entries: [{ ...datev, title: "DATEV\x1b]0;pwned\x07" }] },
      }),
    });
    writeDevice(h.deps.devicePath, device);
    await run(command("search", "datev"), h.deps);
    expect(h.out[0]).toContain("DATEV�]0;pwned�");
  });

  it("warns about vaults and entries that failed the check", async () => {
    const h = harness([typed(PASSPHRASE)], {
      open: async () => ({ ok: true, value: { ...loaded, refusedVaults: 1, refusedEntries: 2 } }),
    });
    writeDevice(h.deps.devicePath, device);
    await run(command("search", "datev"), h.deps);
    expect(h.err).toEqual([
      "Warnung: 1 Tresore nicht geöffnet, ihr Protokoll besteht die Prüfung nicht.",
      "Warnung: 2 Einträge abgelehnt, sie bestehen die Prüfung nicht.",
    ]);
  });

  it("needs a login first", async () => {
    const h = harness([]);
    expect(await run(command("search", "datev"), h.deps)).toBe(1);
    expect(h.err).toEqual(["Dieser Rechner kennt kein Konto. Zuerst: kennwort login"]);
  });

  it("says when the server's data fails the check", async () => {
    const h = harness([typed(PASSPHRASE)], {
      open: async () => ({ ok: false, error: "untrusted" }),
    });
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("search", "datev"), h.deps)).toBe(1);
    expect(h.err).toEqual(["Die Daten des Servers bestehen die Prüfung nicht. Nichts geöffnet."]);
  });
});

describe("kennwort get", () => {
  it("prints the password after the confirmation", async () => {
    const h = harness([typed(PASSPHRASE), typed("j")]);
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("get", "DATEV"), h.deps)).toBe(0);
    expect(h.prompts[1]).toBe("„Passwort“ von „DATEV“ ausgeben? [j/N] ");
    expect(h.out).toEqual([PASSWORD]);
  });

  it("takes yes in English too", async () => {
    useLocale("en");
    const h = harness([typed(PASSPHRASE), typed("YES")]);
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("get", "id-datev", "--field", "username"), h.deps)).toBe(0);
    expect(h.out).toEqual(["anna@weber-haustechnik.de"]);
  });

  it.each(["", "n", "nein", "jein"])(
    "prints nothing secret when the confirmation is refused with %j",
    async (answer) => {
      const h = harness([typed(PASSPHRASE), typed(answer)]);
      writeDevice(h.deps.devicePath, device);
      expect(await run(command("get", "DATEV"), h.deps)).toBe(3);
      expect(h.out).toEqual([]);
      expect(h.err).toEqual(["Nicht bestätigt, nichts ausgegeben."]);
      expect(everything(h)).not.toContain(PASSWORD);
    },
  );

  it("prints nothing without a terminal to confirm on, unless --yes", async () => {
    const h = harness([typed(PASSPHRASE)]);
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("get", "DATEV"), h.deps)).toBe(1);
    expect(h.out).toEqual([]);
    expect(everything(h)).not.toContain(PASSWORD);
  });

  it("prints at once with --yes and the passphrase from stdin", async () => {
    const h = harness([]);
    h.deps.io.stdin = async () => `${PASSPHRASE}\n`;
    const ask = vi.spyOn(h.deps.io, "ask");
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("get", "DATEV", "--yes", "--passphrase-stdin"), h.deps)).toBe(0);
    expect(ask).not.toHaveBeenCalled();
    expect(h.out).toEqual([PASSWORD]);
  });

  it("asks without echo when --passphrase-stdin finds the terminal on stdin", async () => {
    const h = harness([typed(PASSPHRASE)]);
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("get", "DATEV", "--yes", "--passphrase-stdin"), h.deps)).toBe(0);
    expect(h.prompts).toEqual(["Passphrase: "]);
  });

  it("refuses an empty stdin with --passphrase-stdin", async () => {
    const h = harness([]);
    h.deps.io.stdin = async () => "";
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("get", "DATEV", "--yes", "--passphrase-stdin"), h.deps)).toBe(1);
    expect(h.out).toEqual([]);
  });

  it("names the fields there are, not their values, when the field is missing", async () => {
    const h = harness([typed(PASSPHRASE)]);
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("get", "DATEV", "--field", "pin"), h.deps)).toBe(4);
    expect(h.err).toEqual([
      "Der Eintrag hat kein solches Feld: pin. Felder: username, password, website",
    ]);
    expect(everything(h)).not.toContain(PASSWORD);
  });

  it("asks for the ID when two entries share the title", async () => {
    const twin = { ...datev, id: "id-datev-2" };
    const h = harness([typed(PASSPHRASE)], {
      open: async () => ({ ok: true, value: { ...loaded, entries: [datev, twin] } }),
    });
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("get", "DATEV"), h.deps)).toBe(4);
    expect(h.err).toEqual([
      "Mehrere Einträge heißen „DATEV“. Nimm die ID:",
      "  id-datev\tDATEV\tBüro",
      "  id-datev-2\tDATEV\tBüro",
    ]);
    expect(h.out).toEqual([]);
  });

  it("keeps escape sequences of a secret off the terminal, but not out of a pipe", async () => {
    const tricky = { ...datev, fields: [field("password", "secret", "a\x1b[2Jb")] };
    const open: typeof withAccount = async () => ({
      ok: true,
      value: { ...loaded, entries: [tricky] },
    });
    const toTerminal = harness([typed(PASSPHRASE)], { open });
    toTerminal.deps.io.stdoutIsTerminal = true;
    writeDevice(toTerminal.deps.devicePath, device);
    await run(command("get", "DATEV", "--yes"), toTerminal.deps);
    expect(toTerminal.out).toEqual(["a�[2Jb"]);
    const toPipe = harness([typed(PASSPHRASE)], { open });
    writeDevice(toPipe.deps.devicePath, device);
    await run(command("get", "DATEV", "--yes"), toPipe.deps);
    expect(toPipe.out).toEqual(["a\x1b[2Jb"]);
  });
});

describe("kennwort unlock, lock and logout", () => {
  it("unlock checks everything and keeps nothing", async () => {
    const h = harness([typed(PASSPHRASE)]);
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("unlock"), h.deps)).toBe(0);
    expect(h.out).toEqual([
      "Passphrase und Server geprüft. Tresore: 1, Einträge: 1. Es bleibt nichts entsperrt.",
    ]);
  });

  it("lock has nothing to lock", async () => {
    const h = harness([]);
    expect(await run(command("lock"), h.deps)).toBe(0);
    expect(h.out).toEqual([
      "Nichts entsperrt: Kennwort hält zwischen zwei Befehlen keinen Schlüssel.",
    ]);
  });

  it("logout forgets the device", async () => {
    const h = harness([]);
    writeDevice(h.deps.devicePath, device);
    expect(await run(command("logout"), h.deps)).toBe(0);
    expect(readDevice(h.deps.devicePath)).toEqual({ ok: true, value: undefined });
    expect(h.out).toEqual(["Dieser Rechner hat das Konto vergessen."]);
  });

  it("help lists every command", async () => {
    const h = harness([]);
    expect(await run(command("--help"), h.deps)).toBe(0);
    for (const name of ["login", "unlock", "lock", "search", "get", "logout"])
      expect(h.out.join("\n")).toContain(`  ${name}`);
  });
});
