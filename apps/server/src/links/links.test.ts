// K-601 (P-18): one-time links on the server. Jonas of Weber Haustechnik stores a ciphertext with
// an expiry and a number of fetches; a craftsman without an account fetches it by the ID in the
// address until the count runs out or the time is up. The server never sees the link secret.
import { describe, expect, it } from "bun:test";
import { encodeBytes, LinkCreated, LinkFetched, LinkList } from "@kennwort/core";
import { eq } from "drizzle-orm";
import { auditEvents, oneTimeLinks } from "../db/schema.ts";
import { signInSetup } from "../testing/sign-in-setup.ts";
import { MAX_ACTIVE_LINKS } from "./routes.ts";

const HOUR = 3_600_000;
const sealed = new Uint8Array(120).map((_, i) => (i * 7) & 0xff);
const body = (over: Record<string, unknown> = {}) => ({
  ciphertext: encodeBytes(sealed),
  expiresInMs: HOUR,
  maxFetches: 2,
  ...over,
});

const setup = async (options: { rateLimit?: number } = {}) => {
  const server = await signInSetup(options);
  const jonas = await server.member("weber", "owner");
  const anna = await server.member("weber", "member");
  const max = await server.member("mueller", "owner");
  const create = async (token = jonas.token, over: Record<string, unknown> = {}) => {
    const answer = await server.request("/api/links", { token, body: body(over) });
    expect(answer.status).toBe(201);
    return LinkCreated.parse(await answer.json());
  };
  const open = (fetchId: string, ip = "198.51.100.7") =>
    server.request(`/auth/links/${fetchId}/open`, { method: "POST", ip });
  return { ...server, jonas, anna, max, create, open };
};

const auditOf = (db: Awaited<ReturnType<typeof setup>>["db"], company: string) =>
  db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.companyId, company))
    .all()
    .filter((e) => e.action.startsWith("link-"));

describe("creating a link", () => {
  it("stores the ciphertext, expiry and count, a hash of the fetch ID, and audits it", async () => {
    const { db, clock, jonas, create } = await setup();
    const made = await create();
    expect(made.id).not.toBe(made.fetchId);
    expect(made.expiresAt).toBe(clock.now() + HOUR);
    const row = db.select().from(oneTimeLinks).get();
    expect(row).toMatchObject({
      id: made.id,
      companyId: "weber",
      createdBy: jonas.id,
      maxFetches: 2,
      remaining: 2,
      createdAt: clock.now(),
      expiresAt: made.expiresAt,
    });
    expect(new Uint8Array(row?.ciphertext ?? [])).toEqual(sealed);
    // The fetch ID is nowhere in the database: only its SHA-256
    expect(row?.fetchHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.select().from(oneTimeLinks).all())).not.toContain(made.fetchId);
    const events = auditOf(db, "weber");
    expect(events.map((e) => [e.action, e.actor, e.subject])).toEqual([
      ["link-created", jonas.id, made.id],
    ]);
    expect(JSON.stringify(events)).not.toContain(made.fetchId);
  });

  it("draws fresh 128-bit IDs for every link", async () => {
    const { create } = await setup();
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const made = await create();
      ids.add(made.id).add(made.fetchId);
    }
    expect(ids.size).toBe(40);
    for (const id of ids) expect(Buffer.from(id, "base64url")).toHaveLength(16);
  });

  it("refuses an expiry past seven days, fetches outside 1 to 10 and more than 64 KiB", async () => {
    const { request, jonas } = await setup();
    for (const over of [
      { expiresInMs: 7 * 24 * HOUR + 1 },
      { expiresInMs: 0 },
      { maxFetches: 0 },
      { maxFetches: 11 },
      { ciphertext: encodeBytes(new Uint8Array(64 * 1024 + 1)) },
      { ciphertext: "" },
    ]) {
      const answer = await request("/api/links", { token: jonas.token, body: body(over) });
      expect(answer.status).toBe(400);
    }
    const max = await request("/api/links", {
      token: jonas.token,
      body: body({ expiresInMs: 7 * 24 * HOUR, maxFetches: 10 }),
    });
    expect(max.status).toBe(201);
  });

  it("needs a session", async () => {
    const { request, db } = await setup();
    expect((await request("/api/links", { body: body() })).status).toBe(401);
    expect((await request("/api/links", { token: "forged", body: body() })).status).toBe(401);
    expect(db.select().from(oneTimeLinks).all()).toHaveLength(0);
  });

  it("holds an account to a number of active links, freed again as they expire", async () => {
    const { create, request, jonas, anna, clock } = await setup();
    for (let i = 0; i < MAX_ACTIVE_LINKS; i++) await create();
    const over = await request("/api/links", { token: jonas.token, body: body() });
    expect(over.status).toBe(409);
    expect(await over.json()).toEqual({ error: "too-many-links" });
    await create(anna.token);
    clock.advance(HOUR);
    await create();
  });

  it("is rate-limited per account", async () => {
    const { request, jonas, anna } = await setup({ rateLimit: 3 });
    const statuses = [];
    for (let i = 0; i < 4; i++)
      statuses.push((await request("/api/links", { token: jonas.token, body: body() })).status);
    expect(statuses).toEqual([201, 201, 201, 429]);
    expect((await request("/api/links", { token: anna.token, body: body() })).status).toBe(201);
  });
});

describe("fetching a link", () => {
  it("hands out the ciphertext as often as allowed, then answers 404 and deletes it", async () => {
    const { db, jonas, create, open } = await setup();
    const made = await create();
    const first = await open(made.fetchId);
    expect(first.status).toBe(200);
    const fetched = LinkFetched.parse(await first.json());
    expect(fetched).toEqual({ ciphertext: sealed, remaining: 1, expiresAt: made.expiresAt });
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("referrer-policy")).toBe("no-referrer");
    expect(first.headers.get("access-control-allow-origin")).toBeNull();
    const second = LinkFetched.parse(await (await open(made.fetchId)).json());
    expect(second.remaining).toBe(0);
    expect(db.select().from(oneTimeLinks).all()).toHaveLength(0);
    const third = await open(made.fetchId);
    expect(third.status).toBe(404);
    expect(await third.json()).toEqual({ error: "not-found" });
    expect(auditOf(db, "weber").map((e) => [e.action, e.actor, e.subject])).toEqual([
      ["link-created", jonas.id, made.id],
      ["link-opened", jonas.id, made.id],
      ["link-opened", jonas.id, made.id],
    ]);
  });

  it("answers 404 once the time is up, deleting the link, with fetches left", async () => {
    const { db, clock, create, open } = await setup();
    const made = await create();
    clock.advance(HOUR - 1);
    expect((await open(made.fetchId)).status).toBe(200);
    clock.advance(1);
    expect((await open(made.fetchId)).status).toBe(404);
    expect(db.select().from(oneTimeLinks).all()).toHaveLength(0);
  });

  it("takes exactly as many fetches as allowed when many come at once", async () => {
    const { db, create, open } = await setup();
    const made = await create(undefined, { maxFetches: 3 });
    const answers = await Promise.all(
      Array.from({ length: 25 }, (_, i) => open(made.fetchId, `203.0.113.${i}`)),
    );
    const statuses = answers.map((a) => a.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(3);
    expect(statuses.filter((s) => s === 404)).toHaveLength(22);
    const remaining = await Promise.all(
      answers.filter((a) => a.status === 200).map(async (a) => LinkFetched.parse(await a.json())),
    );
    expect(remaining.map((r) => r.remaining).sort()).toEqual([0, 1, 2]);
    expect(db.select().from(oneTimeLinks).all()).toHaveLength(0);
  });

  it("is not consumed by a GET, which no link preview turns into a fetch", async () => {
    const { db, create, request } = await setup();
    const made = await create();
    const answer = await request(`/auth/links/${made.fetchId}/open`);
    expect(answer.status).not.toBe(200);
    expect(JSON.stringify(await answer.text())).not.toContain(encodeBytes(sealed));
    expect(db.select().from(oneTimeLinks).get()?.remaining).toBe(2);
  });

  it("does not tell an unknown, malformed, used up, expired or revoked link apart", async () => {
    const { clock, jonas, request, create, open } = await setup();
    const used = await create(undefined, { maxFetches: 1 });
    await open(used.fetchId);
    const expired = await create(undefined, { expiresInMs: 5 * 60_000 });
    const revoked = await create();
    await request(`/api/links/${revoked.id}`, { method: "DELETE", token: jonas.token });
    // Its public ID opens nothing: only the fetch ID does
    const live = await create();
    clock.advance(5 * 60_000);
    const answers = [];
    for (const id of [
      encodeBytes(new Uint8Array(16).fill(9)),
      "not-a-link",
      `${used.fetchId}x`,
      used.fetchId,
      expired.fetchId,
      revoked.fetchId,
      live.id,
    ]) {
      const answer = await open(encodeURIComponent(id));
      answers.push({
        status: answer.status,
        body: await answer.text(),
        cache: answer.headers.get("cache-control"),
        type: answer.headers.get("content-type"),
      });
    }
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(answers[0]).toEqual({
      status: 404,
      body: '{"error":"not-found"}',
      cache: "no-store",
      type: "application/json",
    });
    expect((await open(live.fetchId)).status).toBe(200);
  });

  it("is rate-limited per client address, so IDs cannot be guessed at speed", async () => {
    const { create, open } = await setup({ rateLimit: 3 });
    const made = await create(undefined, { maxFetches: 10 });
    const guess = encodeBytes(new Uint8Array(16).fill(3));
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await open(guess, "198.51.100.9")).status);
    expect(statuses).toEqual([404, 404, 404, 429]);
    // The limit holds for a real ID from that address too, and does not touch its count
    expect((await open(made.fetchId, "198.51.100.9")).status).toBe(429);
    const elsewhere = LinkFetched.parse(await (await open(made.fetchId, "198.51.100.10")).json());
    expect(elsewhere.remaining).toBe(9);
  });
});

describe("listing and revoking", () => {
  it("lists only the account's own links, newest first, with what is left", async () => {
    const { request, clock, jonas, anna, max, create, open } = await setup();
    const older = await create();
    clock.advance(1000);
    const newer = await create(undefined, { maxFetches: 5 });
    await open(newer.fetchId);
    await create(anna.token);
    await create(max.token);
    const listed = LinkList.parse(
      await (await request("/api/links", { token: jonas.token })).json(),
    );
    expect(listed.links.map((l) => [l.id, l.maxFetches, l.remaining])).toEqual([
      [newer.id, 5, 4],
      [older.id, 2, 2],
    ]);
    expect(JSON.stringify(listed)).not.toContain(older.fetchId);
    const answer = await request("/api/links", { token: jonas.token });
    expect(answer.headers.get("cache-control")).toBe("no-store");
  });

  it("leaves out links whose time is up", async () => {
    const { request, clock, jonas, create } = await setup();
    await create(undefined, { expiresInMs: 5 * 60_000 });
    clock.advance(5 * 60_000);
    expect(await (await request("/api/links", { token: jonas.token })).json()).toEqual({
      links: [],
    });
  });

  it("lets only the creator revoke a link, which then cannot be fetched, and audits it", async () => {
    const { db, request, jonas, anna, max, create, open } = await setup();
    const made = await create();
    for (const other of [anna, max]) {
      const answer = await request(`/api/links/${made.id}`, {
        method: "DELETE",
        token: other.token,
      });
      expect(answer.status).toBe(404);
    }
    expect(db.select().from(oneTimeLinks).all()).toHaveLength(1);
    const revoked = await request(`/api/links/${made.id}`, {
      method: "DELETE",
      token: jonas.token,
    });
    expect(revoked.status).toBe(200);
    expect((await open(made.fetchId)).status).toBe(404);
    const again = await request(`/api/links/${made.id}`, { method: "DELETE", token: jonas.token });
    expect(again.status).toBe(404);
    expect(auditOf(db, "weber").map((e) => [e.action, e.actor, e.subject])).toEqual([
      ["link-created", jonas.id, made.id],
      ["link-revoked", jonas.id, made.id],
    ]);
    expect(auditOf(db, "mueller")).toEqual([]);
  });
});
