// K-603 (P-23): the leak check's proxy. Jonas's client asks for the range of a five-character
// SHA-1 prefix; the server passes on what the configured service sends, padding included, and
// takes nothing else, stores nothing on a disk and logs no prefix.
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { rateLimiter } from "../auth/limits.ts";
import { migrate, openDatabase } from "../db/database.ts";
import { accounts, companies } from "../db/schema.ts";
import { createLog } from "../log.ts";
import { PWNED_LIMIT, type PwnedDeps } from "./routes.ts";
import {
  MAX_CACHED_RANGES,
  MAX_RANGE_LENGTH,
  RANGE_TTL_MS,
  type UpstreamDeps,
  upstreamRanges,
} from "./upstream.ts";

const RANGE = `${"A".repeat(35)}:3\r\n${"B".repeat(35)}:0\r\n${"C".repeat(35)}:0`;

const setup = (pwned?: PwnedDeps) => {
  const lines: string[] = [];
  const db = openDatabase(":memory:");
  migrate(db);
  db.insert(companies).values({ id: "weber", createdAt: 1 }).run();
  db.insert(accounts).values({ id: "jonas", companyId: "weber", createdAt: 1 }).run();
  const authenticate = async (request: Request) =>
    request.headers.get("x-test-session") === "jonas"
      ? { accountId: "jonas", companyId: "weber" }
      : undefined;
  const app = createApp({
    db,
    log: createLog("debug", (line) => lines.push(line)),
    authenticate,
    pwned,
  });
  const ask = (prefix: string) =>
    app.request(`/api/pwned/${prefix}`, { headers: { "x-test-session": "jonas" } });
  return { app, lines, ask };
};

/** A service that records what it was asked */
const service = (answer: () => Response | Promise<Response> = () => new Response(RANGE)) => {
  const asked: { url: string; headers: Headers; redirect: string | undefined }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    asked.push({ url, headers: new Headers(init?.headers), redirect: init?.redirect });
    return answer();
  }) as unknown as typeof globalThis.fetch;
  return { asked, fetch };
};

const deps = (over: Partial<UpstreamDeps> = {}): UpstreamDeps => ({
  url: "https://api.pwnedpasswords.com/range/",
  fetch: service().fetch,
  now: () => 1_000,
  ...over,
});

describe("GET /api/pwned/:prefix", () => {
  it("passes on the range of a prefix with its padding, uncached by the browser", async () => {
    const upstream = service();
    const { ask } = setup({ ranges: upstreamRanges(deps(upstream)), allow: () => true });
    const answer = await ask("5BAA6");
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ range: RANGE });
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(upstream.asked.map((a) => a.url)).toEqual([
      "https://api.pwnedpasswords.com/range/5BAA6",
    ]);
    expect(upstream.asked[0]?.headers.get("add-padding")).toBe("true");
    expect(upstream.asked[0]?.headers.get("user-agent")).toBe("Kennwort");
    expect(upstream.asked[0]?.redirect).toBe("error");
  });

  it.each([
    ["lower case", "5baa6"],
    ["four characters", "5BAA"],
    ["six characters", "5BAA61"],
    ["the whole hash", "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8"],
    ["a password", "Sommer2019"],
    ["a line break", "5BAA6%0A"],
    ["a non-hex character", "5BAG6"],
  ])("refuses %s and asks the service nothing", async (_name, prefix) => {
    const upstream = service();
    const { ask } = setup({ ranges: upstreamRanges(deps(upstream)), allow: () => true });
    const answer = await ask(prefix);
    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: "invalid" });
    expect(upstream.asked).toEqual([]);
  });

  it("needs a session", async () => {
    const upstream = service();
    const { app } = setup({ ranges: upstreamRanges(deps(upstream)), allow: () => true });
    expect((await app.request("/api/pwned/5BAA6")).status).toBe(401);
    expect(upstream.asked).toEqual([]);
  });

  it("answers 404 when the operator turned the check off", async () => {
    const { ask } = setup();
    const answer = await ask("5BAA6");
    expect(answer.status).toBe(404);
    expect(await answer.json()).toEqual({ error: "leak-check-off" });
  });

  it("counts requests per account and answers 429 beyond the limit", async () => {
    const upstream = service();
    const keys: string[] = [];
    const allow = rateLimiter(2, PWNED_LIMIT.windowMs);
    const { ask } = setup({
      ranges: upstreamRanges(deps(upstream)),
      allow: (key) => {
        keys.push(key);
        return allow(key);
      },
    });
    expect((await ask("00001")).status).toBe(200);
    expect((await ask("00002")).status).toBe(200);
    const third = await ask("00003");
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: "too-many-requests" });
    expect(keys).toEqual(["pwned:jonas", "pwned:jonas", "pwned:jonas"]);
    expect(upstream.asked).toHaveLength(2);
    expect(PWNED_LIMIT).toEqual({ max: 1200, windowMs: 600_000 });
  });

  it("answers 502 when the service fails, and logs neither the prefix nor the range", async () => {
    const upstream = service(() => new Response("down", { status: 503 }));
    const { ask, lines } = setup({ ranges: upstreamRanges(deps(upstream)), allow: () => true });
    const answer = await ask("5BAA6");
    expect(answer.status).toBe(502);
    expect(await answer.json()).toEqual({ error: "upstream" });
    const ok = setup({ ranges: upstreamRanges(deps()), allow: () => true });
    await ok.ask("1E4C9");
    const logged = [...lines, ...ok.lines].join("\n");
    expect(logged).toContain("/api/pwned/:prefix");
    expect(logged).not.toContain("5BAA6");
    expect(logged).not.toContain("1E4C9");
    expect(logged).not.toContain("A".repeat(35));
  });
});

describe("upstreamRanges", () => {
  it("keeps a range in memory for an hour: the same prefix goes out once, then again", async () => {
    let now = 1_000;
    const upstream = service();
    const ranges = upstreamRanges(deps({ fetch: upstream.fetch, now: () => now }));
    expect(await ranges("5BAA6")).toBe(RANGE);
    now += RANGE_TTL_MS - 1;
    expect(await ranges("5BAA6")).toBe(RANGE);
    expect(upstream.asked).toHaveLength(1);
    now += 1;
    expect(await ranges("5BAA6")).toBe(RANGE);
    expect(upstream.asked).toHaveLength(2);
    expect(RANGE_TTL_MS).toBe(3_600_000);
  });

  it("keeps at most so many ranges and drops the oldest first", async () => {
    const upstream = service();
    const ranges = upstreamRanges(deps({ fetch: upstream.fetch }));
    const prefix = (i: number) => i.toString(16).toUpperCase().padStart(5, "0");
    for (let i = 0; i <= MAX_CACHED_RANGES; i++) await ranges(prefix(i));
    expect(upstream.asked).toHaveLength(MAX_CACHED_RANGES + 1);
    await ranges(prefix(1));
    expect(upstream.asked).toHaveLength(MAX_CACHED_RANGES + 1);
    await ranges(prefix(0));
    expect(upstream.asked).toHaveLength(MAX_CACHED_RANGES + 2);
    expect(MAX_CACHED_RANGES).toBe(10_000);
  });

  it.each([
    ["an error status", () => new Response(RANGE, { status: 500 })],
    ["an HTML page", () => new Response("<html>Wartung</html>")],
    [
      "an answer far too long",
      () => new Response(`${"A".repeat(35)}:1\n`.repeat(MAX_RANGE_LENGTH / 36 + 1)),
    ],
    ["no answer", () => Promise.reject(new Error("offline"))],
  ])("counts %s as no range and keeps nothing of it", async (_name, answer) => {
    const upstream = service(answer as () => Response);
    const ranges = upstreamRanges(deps({ fetch: upstream.fetch }));
    expect(await ranges("5BAA6")).toBeUndefined();
    expect(await ranges("5BAA6")).toBeUndefined();
    expect(upstream.asked).toHaveLength(2);
  });

  it("asks nothing for anything but a prefix", async () => {
    const upstream = service();
    const ranges = upstreamRanges(deps({ fetch: upstream.fetch }));
    expect(await ranges("5baa6")).toBeUndefined();
    expect(await ranges("../x")).toBeUndefined();
    expect(upstream.asked).toEqual([]);
  });

  it("asks a mirror at its own address", async () => {
    const upstream = service();
    const ranges = upstreamRanges(
      deps({ url: "http://pwned.weber.test:8080/range/", fetch: upstream.fetch }),
    );
    await ranges("ABCDE");
    expect(upstream.asked[0]?.url).toBe("http://pwned.weber.test:8080/range/ABCDE");
  });
});
