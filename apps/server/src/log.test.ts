import { describe, expect, it } from "vitest";
import { createLog, pathForLog, redact } from "./log.ts";

const capture = (level: "debug" | "info" | "warn" | "error" = "info") => {
  const lines: string[] = [];
  const log = createLog(
    level,
    (line) => lines.push(line),
    () => new Date("2026-11-19T12:00:00Z"),
  );
  return { log, lines };
};

describe("log", () => {
  it("writes one JSON line with time, level, message and fields", () => {
    const { log, lines } = capture();
    log("info", "request", { method: "GET", status: 200 });
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      time: "2026-11-19T12:00:00.000Z",
      level: "info",
      message: "request",
      method: "GET",
      status: 200,
    });
  });

  it("leaves out levels below the minimum", () => {
    const { log, lines } = capture("warn");
    log("info", "quiet");
    log("debug", "quieter");
    log("error", "loud");
    expect(lines.map((line) => JSON.parse(line).message)).toEqual(["loud"]);
  });

  it.each([
    "passphrase",
    "secretKey",
    "token",
    "apiKey",
    "authorization",
    "cookie",
    "sessionId",
    "signature",
    "ciphertext",
    "body",
  ])("never writes a field named like a secret: %s", (name) => {
    expect(redact({ [name]: "Weber-2026!" })).toEqual({ [name]: "[redacted]" });
  });
});

describe("pathForLog", () => {
  it("writes a one-time link's fetch ID as a placeholder and every other path as it is", () => {
    expect(pathForLog("/auth/links/GpplYT0ymcqF4R5MxemI3g/open")).toBe("/auth/links/:fetchId/open");
    expect(pathForLog("/auth/links/x")).toBe("/auth/links/:fetchId");
    expect(pathForLog("/api/links/GpplYT0ymcqF4R5MxemI3g")).toBe(
      "/api/links/GpplYT0ymcqF4R5MxemI3g",
    );
    expect(pathForLog("/s/auth/links/GpplYT0ymcqF4R5MxemI3g")).toBe(
      "/s/auth/links/GpplYT0ymcqF4R5MxemI3g",
    );
    expect(pathForLog("/auth/pairings/abc/poll")).toBe("/auth/pairings/abc/poll");
  });
});
