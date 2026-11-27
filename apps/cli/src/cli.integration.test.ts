/**
 * The compiled `kennwort` against the real server (K-606): Weber Haustechnik set up through
 * packages/client, then login, search and get as Jonas would type them on a terminal. The server
 * runs on its own port (28320), clear of the dev (18100, 5175) and e2e ports (.agents/skills/checks, "Ports").
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeBytes } from "@kennwort/core";
import { formatSecretKey } from "@kennwort/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runOnTerminal, runPiped } from "./run-cli.test-kit.ts";
import {
  DATEV_PASSWORD,
  JONAS_PASSPHRASE,
  setUpWeber,
  WEBER_ENTRIES,
  WLAN_PASSWORD,
} from "./weber.test-kit.ts";

const PORT = 28320;
const SERVER = `http://localhost:${PORT}`;
const SETUP_CODE = "setup-code-of-weber-haustechnik";
const root = join(import.meta.dirname, "..", "..", "..");
const scratch = mkdtempSync(join(tmpdir(), "kennwort-cli-it-"));
const binary = join(scratch, "kennwort");
const env = {
  PATH: process.env.PATH ?? "",
  HOME: scratch,
  XDG_CONFIG_HOME: join(scratch, "config"),
  LANG: "de_DE.UTF-8",
  TERM: "dumb",
};

const config = join(env.XDG_CONFIG_HOME, "kennwort");

let server: ChildProcess;
let jonas: Awaited<ReturnType<typeof setUpWeber>>;

const waitForHealth = async (deadline: number): Promise<void> => {
  const answer = await fetch(`${SERVER}/health`).catch(() => undefined);
  if (answer?.ok) return;
  if (Date.now() > deadline) throw new Error("server did not start");
  await new Promise((resolve) => setTimeout(resolve, 100));
  return waitForHealth(deadline);
};

beforeAll(async () => {
  const built = spawnSync(
    "bun",
    ["build", "--compile", "--minify", "apps/cli/src/main.ts", "--outfile", binary],
    { cwd: root, encoding: "utf8" },
  );
  if (built.status !== 0) throw new Error(`compile failed: ${built.stderr}`);
  server = spawn("bun", ["apps/server/src/main.ts"], {
    cwd: root,
    env: {
      ...process.env,
      KENNWORT_PORT: String(PORT),
      KENNWORT_DATABASE: ":memory:",
      KENNWORT_LOG_LEVEL: "warn",
      KENNWORT_PUBLIC_URL: SERVER,
      KENNWORT_AUTH_SECRET: "cli-test-only-secret-cli-test-only-secret",
      KENNWORT_SETUP_CODE: SETUP_CODE,
      KENNWORT_PWNED_URL: "off",
      KENNWORT_PUSH: "false",
    },
    stdio: "ignore",
  });
  await waitForHealth(Date.now() + 20_000);
  jonas = await setUpWeber(SERVER, SETUP_CODE);
}, 120_000);

afterAll(() => {
  server?.kill();
});

const passphraseStdin = (args: string[]) =>
  runPiped(binary, [...args, "--passphrase-stdin"], env, `${JONAS_PASSPHRASE}\n`);

describe("kennwort against the real server", { timeout: 120_000 }, () => {
  it("starts as a compiled binary and shows its help", async () => {
    const ran = await runPiped(binary, ["--help"], env);
    expect(ran.code).toBe(0);
    expect(ran.stdout).toContain("Aufruf: kennwort <Befehl> [Optionen]");
  });

  it("logs in on the terminal, with Secret Key and passphrase never echoed", async () => {
    const secretKey = formatSecretKey(jonas.secretKey);
    const ran = await runOnTerminal(binary, ["login"], env, [
      ["Server: ", SERVER],
      ["Konto-ID: ", encodeBytes(jonas.accountId)],
      ["Secret Key: ", secretKey],
      ["Passphrase: ", JONAS_PASSPHRASE],
    ]);
    expect(ran.transcript).toContain(`Angemeldet bei ${SERVER}. Tresore: 1, Einträge: 3.`);
    expect(ran.code).toBe(0);
    expect(ran.transcript).not.toContain(secretKey);
    expect(ran.transcript).not.toContain(JONAS_PASSPHRASE);
    // The device as the web app keeps it, and the account state sealed under AK, both 0600
    for (const name of ["device.json", "state.json"])
      expect(statSync(join(config, name)).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(config, "device.json"), "utf8")).not.toContain(JONAS_PASSPHRASE);
  });

  it("searches titles, usernames and addresses, and prints no secret", async () => {
    const ran = await passphraseStdin(["search", "weber-haustechnik"]);
    expect(ran.code).toBe(0);
    const titles = ran.stdout
      .trim()
      .split("\n")
      .map((line) => line.split("\t")[0]);
    expect(titles).toEqual(["DATEV Unternehmen online", "Lexware Office"]);
    expect(ran.stdout).toContain("\tBüro\t");
    for (const entry of WEBER_ENTRIES)
      for (const field of entry.fields.filter((f) => f.kind === "secret" || f.kind === "totp"))
        expect(ran.stdout + ran.stderr).not.toContain(field.value);
  });

  it("finds nothing by a password", async () => {
    const ran = await passphraseStdin(["search", DATEV_PASSWORD]);
    expect(ran.code).toBe(4);
    expect(ran.stdout).toBe("");
  });

  it("prints the password after the confirmation on the terminal", async () => {
    const ran = await runOnTerminal(binary, ["get", "DATEV Unternehmen online"], env, [
      ["Passphrase: ", JONAS_PASSPHRASE],
      ["ausgeben? [j/N] ", "j"],
    ]);
    expect(ran.code).toBe(0);
    expect(ran.transcript).toContain("„Passwort“ von „DATEV Unternehmen online“ ausgeben? [j/N] ");
    expect(ran.transcript).toContain(DATEV_PASSWORD);
  });

  it("prints nothing secret when the confirmation is refused", async () => {
    const ran = await runOnTerminal(binary, ["get", "WLAN Büro"], env, [
      ["Passphrase: ", JONAS_PASSPHRASE],
      ["ausgeben? [j/N] ", "n"],
    ]);
    expect(ran.code).toBe(3);
    expect(ran.transcript).toContain("Nicht bestätigt, nichts ausgegeben.");
    expect(ran.transcript).not.toContain(WLAN_PASSWORD);
  });

  it("prints nothing without a terminal to confirm on, and prints with --yes", async () => {
    const refused = await passphraseStdin(["get", "WLAN Büro"]);
    expect(refused.code).toBe(1);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).not.toContain(WLAN_PASSWORD);
    const confirmed = await passphraseStdin(["get", "WLAN Büro", "--yes"]);
    expect(confirmed.code).toBe(0);
    expect(confirmed.stdout).toBe(`${WLAN_PASSWORD}\n`);
  });

  it("gives the one-time code, not its key", async () => {
    const ran = await passphraseStdin(["get", "DATEV Unternehmen online", "--field", "totp", "-y"]);
    expect(ran.code).toBe(0);
    expect(ran.stdout).toMatch(/^\d{6}\n$/);
  });

  it("leaves no session of the CLI on the server", async () => {
    const devices = await jonas.api.devices(jonas.token);
    expect(devices?.map((device) => device.name)).not.toContain("CLI · Linux");
  });

  it("refuses a wrong passphrase without echoing it", async () => {
    const ran = await runPiped(
      binary,
      ["unlock", "--passphrase-stdin"],
      env,
      "Falsche-Passphrase\n",
    );
    expect(ran.code).toBe(1);
    expect(ran.stderr).toContain("Passphrase, Konto-ID oder Secret Key stimmen nicht.");
    expect(ran.stdout + ran.stderr).not.toContain("Falsche-Passphrase");
  });

  it("forgets the account on logout", async () => {
    expect((await runPiped(binary, ["logout"], env)).code).toBe(0);
    expect(existsSync(join(config, "device.json")) || existsSync(join(config, "state.json"))).toBe(
      false,
    );
    const ran = await passphraseStdin(["search", "DATEV"]);
    expect(ran.code).toBe(1);
    expect(ran.stderr).toContain("Dieser Rechner kennt kein Konto.");
  });
});
