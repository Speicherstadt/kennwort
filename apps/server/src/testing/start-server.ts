// Starts a server process on a fresh database and waits for /health; for tests and the smoke check.
// The e2e ports (server 28100 and up) keep clear of a running dev server (CLAUDE.md)
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const startServer = async (command: string[], port: number) => {
  const dir = mkdtempSync(join(tmpdir(), "kennwort-server-"));
  const database = join(dir, "data", "kennwort.db");
  const child = spawn(command[0] ?? "bun", command.slice(1), {
    cwd: join(import.meta.dirname, "..", ".."),
    env: { ...process.env, KENNWORT_PORT: String(port), KENNWORT_DATABASE: database },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return { child, database, response };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  child.kill();
  throw new Error("server did not start");
};
