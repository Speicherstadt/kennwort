import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startServer } from "./testing/start-server.ts";

describe("the server process", () => {
  it("starts with an empty database, migrates it and answers /health", async () => {
    const { child, database, response } = await startServer(
      ["bun", "src/main.ts"],
      28100 + Math.floor(Math.random() * 500),
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
