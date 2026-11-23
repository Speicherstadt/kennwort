/**
 * Backup and restore against real servers (K-703, docs/backup.md): Weber Haustechnik on a running
 * server, a backup taken while it runs (`kennwort-server backup`), a restore refused while it runs,
 * then restored into a fresh installation whose new server Jonas opens exactly as the CLI opens
 * his account (account.ts): every vault log and record checked, the entries decrypted. The servers
 * run on their own ports (28330, 28331), clear of the dev and e2e ports (CLAUDE.md).
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeptState } from "@kennwort/client/session/state-sync.ts";
import { afterAll, describe, expect, it } from "vitest";
import { withAccount } from "./account.ts";
import { DATEV_PASSWORD, JONAS_PASSPHRASE, setUpWeber, WEBER_ENTRIES } from "./weber.test-kit.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const SETUP_CODE = "setup-code-of-weber-haustechnik";
const scratch = mkdtempSync(join(tmpdir(), "kennwort-backup-it-"));
const children: ChildProcess[] = [];

const serverEnv = (port: number, database: string) => ({
  ...process.env,
  KENNWORT_PORT: String(port),
  KENNWORT_DATABASE: database,
  KENNWORT_LOG_LEVEL: "warn",
  KENNWORT_PUBLIC_URL: `http://localhost:${port}`,
  KENNWORT_AUTH_SECRET: "backup-test-only-secret-backup-test-only",
  KENNWORT_SETUP_CODE: SETUP_CODE,
  KENNWORT_PWNED_URL: "off",
  KENNWORT_PUSH: "false",
  KENNWORT_UPDATE_CHECK: "false",
});

const waitForHealth = async (url: string, deadline: number): Promise<void> => {
  const answer = await fetch(`${url}/health`).catch(() => undefined);
  if (answer?.ok) return;
  if (Date.now() > deadline) throw new Error("server did not start");
  await new Promise((resolve) => setTimeout(resolve, 100));
  return waitForHealth(url, deadline);
};

const startServer = async (port: number, database: string) => {
  const child = spawn("bun", ["apps/server/src/main.ts"], {
    cwd: root,
    env: serverEnv(port, database),
    stdio: "ignore",
  });
  children.push(child);
  await waitForHealth(`http://localhost:${port}`, Date.now() + 20_000);
  return child;
};

/** `kennwort-server backup|restore <file>` as an operator runs it, with only the database set */
const operation = (name: "backup" | "restore", file: string, database: string) =>
  spawnSync("bun", ["apps/server/src/main.ts", name, file], {
    cwd: root,
    env: { PATH: process.env.PATH ?? "", KENNWORT_DATABASE: database },
    encoding: "utf8",
  });

/** The account state the CLI would keep in a file, here in memory */
const inMemory = () => {
  let kept: KeptState | undefined;
  return {
    read: () => kept,
    keep: (value: KeptState) => {
      kept = value;
      return true;
    },
  };
};

afterAll(() => {
  for (const child of children) child.kill();
});

describe("backup and restore", () => {
  it("backs up a running server and restores it into a fresh one with every entry intact", async () => {
    const first = join(scratch, "first", "data", "kennwort.db");
    const running = await startServer(28330, first);
    const jonas = await setUpWeber("http://localhost:28330", SETUP_CODE);

    const backup = join(scratch, "backups", "kennwort.db");
    const backedUp = operation("backup", backup, first);
    expect(backedUp.status, backedUp.stdout).toBe(0);
    expect(backedUp.stdout).toContain('"message":"backup written"');

    // A restore into the database of a running server would lose its writes: refused
    const refused = operation("restore", backup, first);
    expect(refused.status).toBe(1);
    expect(refused.stdout).toContain('"reason":"in-use"');
    running.kill();

    const fresh = join(scratch, "fresh", "data", "kennwort.db");
    const restored = operation("restore", backup, fresh);
    expect(restored.status, restored.stdout).toBe(0);
    await startServer(28331, fresh);

    const device = {
      server: "http://localhost:28331",
      accountId: jonas.accountId,
      secretKey: jonas.secretKey,
      deviceId: crypto.getRandomValues(new Uint8Array(16)),
    };
    const connection = { send: fetch, platform: "linux", kept: inMemory() };
    const opened = await withAccount(device, JONAS_PASSPHRASE, connection);
    if (!opened.ok) throw new Error(`not opened: ${opened.error}`);
    expect(opened.value.refusedVaults).toBe(0);
    expect(opened.value.refusedEntries).toBe(0);
    expect(opened.value.entries.map((entry) => entry.title).sort()).toEqual(
      WEBER_ENTRIES.map((entry) => entry.title).sort(),
    );
    const datev = opened.value.entries.find((entry) => entry.title.startsWith("DATEV"));
    expect(datev?.password).toBe(DATEV_PASSWORD);
  }, 120_000);
});
