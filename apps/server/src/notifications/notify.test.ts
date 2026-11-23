// K-602: who gets a notification row, how many an account keeps, and when a push goes out
import { describe, expect, it } from "bun:test";
import { migrate, openDatabase } from "../db/database.ts";
import { accounts, companies, notificationPrefs, notifications } from "../db/schema.ts";
import { createHub } from "../sync/hub.ts";
import { createNotifier, MAX_NOTIFICATIONS, prefsOf } from "./notify.ts";

const setup = () => {
  const db = openDatabase(":memory:");
  migrate(db);
  db.insert(companies)
    .values([
      { id: "weber", createdAt: 1 },
      { id: "mueller", createdAt: 1 },
    ])
    .run();
  db.insert(accounts)
    .values([
      { id: "jonas", companyId: "weber", role: "owner", createdAt: 1 },
      { id: "anna", companyId: "weber", createdAt: 1 },
      { id: "sandra", companyId: "weber", createdAt: 1, leftAt: 5 },
      { id: "max", companyId: "mueller", createdAt: 1 },
    ])
    .run();
  let time = 1_000;
  const hub = createHub<null>();
  const pushed: string[] = [];
  const notify = createNotifier({
    db,
    now: () => (time += 1),
    hub,
    push: async (accountId) => {
      pushed.push(accountId);
    },
  });
  const rows = () =>
    db
      .select()
      .from(notifications)
      .all()
      .map((row) => row.accountId);
  return { db, hub, pushed, notify, rows };
};

describe("createNotifier", () => {
  it("writes one row per current account of the company, never the actor, someone who left or another company", () => {
    const s = setup();
    s.notify({
      companyId: "weber",
      recipients: ["jonas", "anna", "anna", "sandra", "max", "nobody"],
      kind: "root-changed",
      actor: "jonas",
    });
    expect(s.rows()).toEqual(["anna"]);
    const [row] = s.db.select().from(notifications).all();
    expect(row).toEqual(
      expect.objectContaining({
        companyId: "weber",
        kind: "root-changed",
        subject: null,
        actor: "jonas",
        readAt: null,
      }),
    );
    expect(row?.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("writes nothing when only the actor is named", () => {
    const s = setup();
    s.notify({ companyId: "weber", recipients: ["jonas"], kind: "root-changed", actor: "jonas" });
    expect(s.rows()).toEqual([]);
    expect(s.pushed).toEqual([]);
  });

  it("tickles the account's live channel with nothing but that something is new", () => {
    const s = setup();
    const heard: unknown[] = [];
    s.hub.subscribe("anna", (event) => heard.push(event));
    s.hub.subscribe("jonas", () => heard.push("wrong account"));
    s.notify({ companyId: "weber", recipients: ["anna"], kind: "vault-added", subject: "v1" });
    expect(heard).toEqual([null]);
  });

  it("pushes only the kinds the account wants as push, all by default", () => {
    const s = setup();
    s.db
      .insert(notificationPrefs)
      .values({ accountId: "anna", prefs: '{"push":["root-changed"]}' })
      .run();
    s.notify({ companyId: "weber", recipients: ["anna", "jonas"], kind: "link-opened" });
    expect(s.pushed).toEqual(["jonas"]);
    s.notify({ companyId: "weber", recipients: ["anna"], kind: "root-changed" });
    expect(s.pushed).toEqual(["jonas", "anna"]);
  });

  it("keeps the newest rows of an account only", () => {
    const s = setup();
    for (let i = 0; i < MAX_NOTIFICATIONS + 5; i++)
      s.notify({
        companyId: "weber",
        recipients: ["anna", "jonas"],
        kind: "vault-added",
        subject: `v${i}`,
      });
    const annas = s.db
      .select()
      .from(notifications)
      .all()
      .filter((row) => row.accountId === "anna");
    expect(annas).toHaveLength(MAX_NOTIFICATIONS);
    expect(annas.map((row) => row.subject)).not.toContain("v4");
    expect(annas.map((row) => row.subject)).toContain("v5");
    expect(s.rows().filter((id) => id === "jonas")).toHaveLength(MAX_NOTIFICATIONS);
  });

  it("keeps working when a push fails", async () => {
    const db = openDatabase(":memory:");
    migrate(db);
    db.insert(companies).values({ id: "weber", createdAt: 1 }).run();
    db.insert(accounts).values({ id: "anna", companyId: "weber", createdAt: 1 }).run();
    const notify = createNotifier({
      db,
      now: () => 1,
      hub: createHub<null>(),
      push: () => Promise.reject(new Error("push service down")),
    });
    notify({ companyId: "weber", recipients: ["anna"], kind: "vault-added" });
    await Promise.resolve();
    expect(db.select().from(notifications).all()).toHaveLength(1);
  });
});

describe("prefsOf", () => {
  it("reads the stored kinds, and the defaults without a row or with a broken one", () => {
    const s = setup();
    expect(prefsOf(s.db, "anna").push).toContain("link-opened");
    s.db
      .insert(notificationPrefs)
      .values({ accountId: "anna", prefs: '{"push":["root-changed"]}' })
      .run();
    expect(prefsOf(s.db, "anna")).toEqual({ push: ["root-changed"] });
    s.db.insert(notificationPrefs).values({ accountId: "jonas", prefs: '{"push":["mail"]}' }).run();
    expect(prefsOf(s.db, "jonas").push).toContain("root-changed");
  });
});
