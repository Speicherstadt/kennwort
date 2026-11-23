import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiHeaders, appHeaders } from "@kennwort/core/headers";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { migrate, openDatabase } from "../db/database.ts";
import { createLog } from "../log.ts";

const INDEX = "<!doctype html><title>Kennwort</title>";

/** A built web app as apps/web/dist has it, and a file next to it that must never be served */
const webBuild = () => {
  const parent = mkdtempSync(join(tmpdir(), "kennwort-web-"));
  const root = join(parent, "dist");
  const files: Record<string, string> = {
    "index.html": INDEX,
    "assets/index-abc123.js": 'console.log("app")',
    "assets/index-abc123.css": "body{}",
    "assets/geist-latin.woff2": "font",
    "icons/icon.svg": "<svg/>",
    "icons/icon-192.png": "png",
    "manifest.webmanifest": "{}",
    "sw.js": "self.x=1",
    "release.json": "{}",
    "release.sig": "abcd",
    ".env": "SECRET=1",
  };
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  writeFileSync(join(parent, "secret.txt"), "outside the build");
  symlinkSync(join(parent, "secret.txt"), join(root, "assets", "linked.js"));
  return root;
};

const setup = (options: { webRoot?: string; secure?: boolean } = {}) => {
  const db = openDatabase(":memory:");
  migrate(db);
  return createApp({
    db,
    log: createLog("error", () => undefined),
    authenticate: async () => undefined,
    ...options,
  });
};

/** Every header of the table, with exactly its value */
const expectHeaders = (response: Response, expected: Record<string, string>) => {
  for (const [name, value] of Object.entries(expected)) {
    expect([name, response.headers.get(name)]).toEqual([name, value]);
  }
};

const root = webBuild();

describe("the web app's pages", () => {
  // `/`, a deep route of the app and a one-time link: each gets index.html with the app's policy
  it.each(["/", "/entries/abc", "/vaults/v1/e1", "/s/Zm9vYmFy"])("%s", async (path) => {
    const response = await setup({ webRoot: root }).request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expectHeaders(response, appHeaders({ secure: false }));
    expect(response.headers.get("strict-transport-security")).toBeNull();
    expect(await response.text()).toBe(INDEX);
  });

  it("answers HEAD like GET, without a body", async () => {
    const response = await setup({ webRoot: root }).request("/entries", { method: "HEAD" });
    expect(response.status).toBe(200);
    expectHeaders(response, appHeaders({ secure: false }));
  });

  it("adds HSTS and upgrade-insecure-requests behind https", async () => {
    const response = await setup({ webRoot: root, secure: true }).request("/s/Zm9vYmFy");
    expectHeaders(response, appHeaders({ secure: true }));
    expect(response.headers.get("content-security-policy")).toContain("upgrade-insecure-requests");
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000");
  });
});

describe("the web app's files", () => {
  it.each([
    [
      "/assets/index-abc123.js",
      "text/javascript; charset=utf-8",
      "public, max-age=31536000, immutable",
    ],
    ["/assets/index-abc123.css", "text/css; charset=utf-8", "public, max-age=31536000, immutable"],
    ["/assets/geist-latin.woff2", "font/woff2", "public, max-age=31536000, immutable"],
    ["/icons/icon.svg", "image/svg+xml", "no-cache"],
    ["/icons/icon-192.png", "image/png", "no-cache"],
    ["/manifest.webmanifest", "application/manifest+json", "no-cache"],
    ["/sw.js", "text/javascript; charset=utf-8", "no-cache"],
    ["/release.json", "application/json", "no-cache"],
    ["/release.sig", "text/plain; charset=utf-8", "no-cache"],
  ])("%s carries its type, its caching and the app's policy", async (path, type, cache) => {
    const response = await setup({ webRoot: root }).request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(type);
    expect(response.headers.get("cache-control")).toBe(cache);
    expectHeaders(response, appHeaders({ secure: false }));
  });

  it.each([
    "/assets/missing.js",
    "/.env",
    "/../secret.txt",
    "/%2e%2e/secret.txt",
    "/assets/..%2f..%2fsecret.txt",
    "/%E0%A4%A",
    "/assets/linked.js",
  ])("%s is not found, as JSON in a sandbox", async (path) => {
    const response = await setup({ webRoot: root }).request(path);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not-found" });
    expectHeaders(response, apiHeaders({ secure: false }));
  });

  it("serves nothing but GET and HEAD", async () => {
    const response = await setup({ webRoot: root }).request("/", { method: "POST" });
    expect(response.status).toBe(404);
    expectHeaders(response, apiHeaders({ secure: false }));
  });
});

describe("the server's own answers", () => {
  it.each(["/health", "/api/vaults", "/api/nothing", "/auth/nothing"])(
    "%s keeps its JSON answer and gets the sandbox policy",
    async (path) => {
      const response = await setup({ webRoot: root }).request(path);
      expect(response.headers.get("content-type")).toContain("application/json");
      expectHeaders(response, apiHeaders({ secure: false }));
    },
  );

  it("sends HSTS behind https", async () => {
    const response = await setup({ secure: true }).request("/health");
    expectHeaders(response, apiHeaders({ secure: true }));
  });

  it("serves no page without a web build, as before", async () => {
    const response = await setup().request("/");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not-found" });
    expectHeaders(response, apiHeaders({ secure: false }));
  });
});
