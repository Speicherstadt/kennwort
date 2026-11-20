import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { migrate, openDatabase } from "./db/database.ts";
import { createLog } from "./log.ts";

const setup = () => {
  const lines: string[] = [];
  const db = openDatabase(":memory:");
  migrate(db);
  const authenticate = async () => undefined;
  return {
    app: createApp({ db, log: createLog("debug", (line) => lines.push(line)), authenticate }),
    lines,
    db,
  };
};

describe("GET /health", () => {
  it("answers ok when the database is reachable", async () => {
    const { app } = setup();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("answers 503 when the database is gone", async () => {
    const { app, db } = setup();
    db.$client.close();
    const response = await app.request("/health");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable", database: "unreachable" });
  });
});

describe("request logs", () => {
  it("name method, path and status but no header, query or body", async () => {
    const { app, lines } = setup();
    await app.request("/health?token=Weber-2026!", {
      method: "GET",
      headers: { authorization: "Bearer Weber-2026!", cookie: "session=Weber-2026!" },
    });
    await app.request("/nothing", {
      method: "POST",
      body: JSON.stringify({ passphrase: "Weber-2026!" }),
    });
    const written = lines.join("\n");
    expect(written).not.toContain("Weber-2026!");
    expect(lines.map((line) => JSON.parse(line))).toMatchObject([
      { message: "request", method: "GET", path: "/health", status: 200 },
      { message: "request", method: "POST", path: "/nothing", status: 404 },
    ]);
  });
});
