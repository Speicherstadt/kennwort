// K-602 (P-24): the notification routes and Web Push with a fake push service. Anna of Weber
// Haustechnik lists, reads and deletes her notifications, chooses which kinds go out as push and
// turns push on for her phone; the push carries no content, and a dropped subscription goes.
import { describe, expect, it } from "bun:test";
import { createPublicKey, verify } from "node:crypto";
import { encodeBytes, NotificationList, PushKey } from "@kennwort/core";
import { eq } from "drizzle-orm";
import { authSession, pushSubscriptions } from "../db/schema.ts";
import { signInSetup } from "../testing/sign-in-setup.ts";
import { TEST_VAPID_JWK } from "../testing/vapid-test-key.ts";
import { pushHostAllowed } from "./push.ts";
import { MAX_SUBSCRIPTIONS } from "./routes.ts";
import { importVapid } from "./vapid.ts";

const PHONE = "https://fcm.googleapis.com/fcm/send/anna-phone";
const LAPTOP = "https://updates.push.services.mozilla.com/wpush/v2/anna-laptop";

type Sent = { url: string; init: RequestInit };

/** A push service that answers each address with the status given, 201 by default */
const fakePushService = (statuses: Record<string, number> = {}) => {
  const sent: Sent[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(null, { status: statuses[url] ?? 201 });
  };
  return { sent, fetch };
};

const setup = async (statuses: Record<string, number> = {}) => {
  const service = fakePushService(statuses);
  const vapid = await importVapid(TEST_VAPID_JWK);
  const server = await signInSetup({
    push: {
      fetch: service.fetch,
      vapid: async () => vapid,
      subject: "https://kennwort.weber.example",
      allowHost: pushHostAllowed(),
    },
  });
  const jonas = await server.member("weber", "owner");
  const anna = await server.member("weber", "member");
  const list = async (token = anna.token) =>
    NotificationList.parse(await (await server.request("/api/notifications", { token })).json());
  const subscribe = (endpoint: string, token = anna.token) =>
    server.request("/api/push/subscription", { method: "PUT", token, body: { endpoint } });
  const tell = (kind: "vault-added" | "link-opened" = "vault-added") =>
    server.app.notify({
      companyId: "weber",
      recipients: [anna.id],
      kind,
      subject: "v1",
      actor: jonas.id,
    });
  /** The pushes run after the route answered; one turn of the event loop lets them finish */
  const settled = () => new Promise((resolve) => setTimeout(resolve, 10));
  return { ...server, service, vapid, jonas, anna, list, subscribe, tell, settled };
};

describe("the list", () => {
  it("shows Anna her own notifications, newest first, with the unread count", async () => {
    const s = await setup();
    s.tell("vault-added");
    await new Promise((resolve) => setTimeout(resolve, 5));
    s.tell("link-opened");
    const listed = await s.list();
    expect(listed.notifications.map((n) => n.kind)).toEqual(["link-opened", "vault-added"]);
    expect(listed.unread).toBe(2);
    expect((await s.list(s.jonas.token)).notifications).toEqual([]);
  });

  it("marks one read, keeps the time of the first read, then all; deletes one", async () => {
    const s = await setup();
    s.tell();
    s.tell();
    const [first, second] = (await s.list()).notifications;
    const read = (id: string) =>
      s.request(`/api/notifications/${id}/read`, { method: "POST", token: s.anna.token });
    expect((await read(first?.id ?? "")).status).toBe(200);
    expect((await read(first?.id ?? "")).status).toBe(200);
    expect((await s.list()).unread).toBe(1);
    // Jonas cannot touch Anna's notification
    expect(
      (
        await s.request(`/api/notifications/${second?.id}/read`, {
          method: "POST",
          token: s.jonas.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (await s.request("/api/notifications/read", { method: "POST", token: s.anna.token })).status,
    ).toBe(200);
    expect((await s.list()).unread).toBe(0);
    expect((await read("unknown")).status).toBe(404);
    const remove = (id: string, token = s.anna.token) =>
      s.request(`/api/notifications/${id}`, { method: "DELETE", token });
    expect((await remove(first?.id ?? "", s.jonas.token)).status).toBe(404);
    expect((await remove(first?.id ?? "")).status).toBe(200);
    expect((await remove(first?.id ?? "")).status).toBe(404);
    expect((await s.list()).notifications).toHaveLength(1);
  });
});

describe("preferences", () => {
  it("are every kind by default, stored per account, and refuse unknown kinds", async () => {
    const s = await setup();
    const get = async (token = s.anna.token) =>
      (await s.request("/api/notifications/preferences", { token })).json();
    expect((await get()).push).toContain("root-changed");
    const put = (body: unknown) =>
      s.request("/api/notifications/preferences", { method: "PUT", token: s.anna.token, body });
    expect((await put({ push: ["root-changed"] })).status).toBe(200);
    expect(await get()).toEqual({ push: ["root-changed"] });
    expect((await get(s.jonas.token)).push).toContain("link-opened");
    expect((await put({ push: ["mail"] })).status).toBe(400);
    expect((await put({ push: [] })).status).toBe(200);
    expect(await get()).toEqual({ push: [] });
  });
});

describe("Web Push", () => {
  it("hands out the VAPID public key", async () => {
    const s = await setup();
    const key = PushKey.parse(
      await (await s.request("/api/push/key", { token: s.anna.token })).json(),
    );
    expect(key.publicKey).toEqual(s.vapid.publicKey);
  });

  it("sends an empty push with a VAPID JWT for the push service's origin, TTL and a fixed topic", async () => {
    const s = await setup();
    expect((await s.subscribe(PHONE)).status).toBe(200);
    s.tell();
    await s.settled();
    expect(s.service.sent).toHaveLength(1);
    const [{ url, init } = { url: "", init: {} }] = s.service.sent;
    expect(url).toBe(PHONE);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    const headers = new Headers(init.headers);
    expect(headers.get("ttl")).toBe("86400");
    expect(headers.get("topic")).toBe("kennwort");
    expect(headers.get("content-length")).toBe("0");
    expect(headers.get("content-encoding")).toBeNull();
    const [, jwt = "", k = ""] =
      /^vapid t=([^,]+), k=(.+)$/.exec(headers.get("authorization") ?? "") ?? [];
    expect(k).toBe(encodeBytes(s.vapid.publicKey));
    const [header = "", claims = "", signature = ""] = jwt.split(".");
    expect(JSON.parse(Buffer.from(claims, "base64url").toString()).aud).toBe(
      "https://fcm.googleapis.com",
    );
    const key = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: TEST_VAPID_JWK.x, y: TEST_VAPID_JWK.y },
      format: "jwk",
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        { key, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    // Nothing of the notification goes to the push service: no kind, subject or account
    const everything = JSON.stringify({ url, headers: [...headers] });
    for (const leak of ["vault-added", "v1", s.anna.id, s.jonas.id])
      expect(everything).not.toContain(leak);
  });

  it("pushes only the kinds Anna wants as push", async () => {
    const s = await setup();
    await s.subscribe(PHONE);
    await s.request("/api/notifications/preferences", {
      method: "PUT",
      token: s.anna.token,
      body: { push: ["link-opened"] },
    });
    s.tell("vault-added");
    await s.settled();
    expect(s.service.sent).toHaveLength(0);
    s.tell("link-opened");
    await s.settled();
    expect(s.service.sent).toHaveLength(1);
  });

  it("drops a subscription the push service answers with 404 or 410, keeps one after a 500", async () => {
    const s = await setup({ [PHONE]: 410, [LAPTOP]: 500 });
    await s.subscribe(PHONE);
    await s.subscribe(LAPTOP);
    const third = "https://fcm.googleapis.com/fcm/send/anna-tablet";
    await s.subscribe(third);
    s.tell();
    await s.settled();
    expect(s.service.sent.map((x) => x.url).sort()).toEqual([PHONE, LAPTOP, third].sort());
    const left = () =>
      s.db
        .select()
        .from(pushSubscriptions)
        .all()
        .map((row) => row.endpoint)
        .sort();
    expect(left()).toEqual([LAPTOP, third].sort());
    const gone = await setup({ [PHONE]: 404 });
    await gone.subscribe(PHONE);
    gone.tell();
    await gone.settled();
    expect(gone.db.select().from(pushSubscriptions).all()).toEqual([]);
  });

  it("drops the subscription of a session that ended instead of pushing to it", async () => {
    const s = await setup();
    await s.subscribe(PHONE);
    s.db.delete(authSession).where(eq(authSession.userId, s.anna.id)).run();
    s.tell();
    await s.settled();
    expect(s.service.sent).toEqual([]);
    expect(s.db.select().from(pushSubscriptions).all()).toEqual([]);
  });

  it("takes only addresses of known push services over https, and a limited number per account", async () => {
    const s = await setup();
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://localhost/push",
      "https://169.254.169.254/latest",
      "https://fcm.googleapis.com.evil.example/x",
      "https://fcm.googleapis.com:8443/x",
      "https://user:pw@fcm.googleapis.com/x",
    ])
      expect((await s.subscribe(endpoint)).status).toBe(400);
    expect((await s.subscribe("https://web.push.apple.com/abc")).status).toBe(200);
    for (let i = 1; i < MAX_SUBSCRIPTIONS; i++) await s.subscribe(`${PHONE}-${i}`);
    expect((await s.subscribe(`${PHONE}-more`)).status).toBe(409);
    // One already stored is taken again
    expect((await s.subscribe(`${PHONE}-1`)).status).toBe(200);
  });

  it("moves an address to the account that subscribed last, and lets only its account remove it", async () => {
    const s = await setup();
    await s.subscribe(PHONE);
    await s.subscribe(PHONE, s.jonas.token);
    const owner = () => s.db.select().from(pushSubscriptions).get()?.accountId;
    expect(owner()).toBe(s.jonas.id);
    const remove = (token: string) =>
      s.request("/api/push/subscription", { method: "DELETE", token, body: { endpoint: PHONE } });
    await remove(s.anna.token);
    expect(owner()).toBe(s.jonas.id);
    await remove(s.jonas.token);
    expect(owner()).toBeUndefined();
    expect(
      (
        await s.request("/api/push/subscription", {
          method: "DELETE",
          token: s.anna.token,
          body: {},
        })
      ).status,
    ).toBe(400);
  });

  it("answers 404 for key and subscription where push is not set up", async () => {
    const server = await signInSetup();
    const anna = await server.member("weber", "member");
    expect((await server.request("/api/push/key", { token: anna.token })).status).toBe(404);
    const put = await server.request("/api/push/subscription", {
      method: "PUT",
      token: anna.token,
      body: { endpoint: PHONE },
    });
    expect(put.status).toBe(404);
  });
});

describe("the live channel", () => {
  it("says only that something is new", async () => {
    const s = await setup();
    const response = await s.request("/api/notifications/events", { token: s.anna.token });
    const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
    expect((await reader?.read())?.value).toContain("event: ready");
    s.tell();
    const next = (await reader?.read())?.value ?? "";
    expect(next).toContain("event: notification");
    expect(next).not.toContain("vault-added");
    expect(next).not.toContain("v1");
    await reader?.cancel();
  });
});
