import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startServer } from "./testing/start-server.ts";

describe("the server process", () => {
  it("starts with an empty database, migrates it and answers /health", async () => {
    const { child, database, response } = await startServer(
      ["bun", "src/main.ts"],
      28101 + Math.floor(Math.random() * 500),
    );
    try {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok", database: "ok" });
      expect(existsSync(database)).toBe(true);
    } finally {
      child.kill();
    }
  });
});

describe("startServer", () => {
  it("kills a child that never starts listening", async () => {
    const started = startServer(["sleep", "30"], 28798, 300);
    await expect(started).rejects.toThrow("server did not start");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(Bun.spawnSync(["pgrep", "-fx", "sleep 30"]).stdout.toString().trim()).toBe("");
  });

  it("fails when its own server cannot start because the port is taken", async () => {
    const port = 28601 + Math.floor(Math.random() * 90);
    const other = Bun.serve({ port, fetch: () => Response.json({ status: "ok", database: "ok" }) });
    try {
      await expect(startServer(["bun", "src/main.ts"], port)).rejects.toThrow(
        "server exited with 1",
      );
    } finally {
      other.stop(true);
    }
  });
});
