// Starts a server process on a fresh database and waits for /health; for tests and the smoke check.
// The e2e ports (server 28100 and up) keep clear of a running dev server (CLAUDE.md)
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const startServer = async (command: string[], port: number, timeoutMs = 10_000) => {
  const dir = mkdtempSync(join(tmpdir(), "kennwort-server-"));
  const database = join(dir, "data", "kennwort.db");
  const child = spawn(command[0] ?? "bun", command.slice(1), {
    cwd: join(import.meta.dirname, "..", ".."),
    env: {
      ...process.env,
      KENNWORT_PORT: String(port),
      KENNWORT_DATABASE: database,
      KENNWORT_AUTH_SECRET: "smoke-test-secret-of-at-least-32-chars",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Its own "listening" line proves this child serves the port, not some other process
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("server did not start"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes('"message":"listening"')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}`));
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  return { child, database, response };
};
