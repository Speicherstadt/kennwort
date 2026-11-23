import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import {
  defaultNotificationPrefs,
  NOTIFICATION_KINDS,
  Notification,
  NotificationList,
  NotificationPrefs,
  PushKey,
  PushSubscriptionWire,
  wantsPush,
} from "./wire.ts";

// K-602: what goes between client and server for a notification; IDs only, never a name
const row = (over: Record<string, unknown> = {}) => ({
  id: "AAAAAAAAAAAAAAAAAAAAAA",
  kind: "access-requested",
  subject: "vault_1-x",
  actor: "anna",
  createdAt: 1_700_000_000_000,
  read: false,
  ...over,
});

describe("kinds", () => {
  it("are the twelve kinds, frozen, with the K-603 report as the last", () => {
    expect(NOTIFICATION_KINDS).toEqual([
      "access-requested",
      "vault-added",
      "share-received",
      "invitation-accepted",
      "member-renewed",
      "root-changed",
      "emergency-requested",
      "emergency-answered",
      "emergency-granted",
      "account-recovered",
      "link-opened",
      "security-report",
    ]);
    expect(Object.isFrozen(NOTIFICATION_KINDS)).toBe(true);
  });
});

describe("Notification", () => {
  it("takes a row with IDs, and subject and actor as null", () => {
    expect(Notification.parse(row())).toEqual(row());
    expect(Notification.parse(row({ subject: null, actor: null }))).toEqual(
      row({ subject: null, actor: null }),
    );
  });

  it.each([
    ["an unknown kind", { kind: "entry-renamed" }],
    ["a name with a space as subject", { subject: "Büro Weber" }],
    ["a subject with a character outside base64url", { subject: "a/b" }],
    ["a subject with text before a valid ID", { subject: " abc" }],
    ["a subject with text after a valid ID", { subject: "abc " }],
    ["an empty subject", { subject: "" }],
    ["an actor of 65 characters", { actor: "a".repeat(65) }],
    ["an empty ID", { id: "" }],
    ["a fractional time", { createdAt: 1.5 }],
    ["a negative time", { createdAt: -1 }],
    ["read as a number", { read: 1 }],
  ])("refuses %s", (_name, over) => {
    expect(Notification.safeParse(row(over)).success).toBe(false);
  });

  it("takes an ID of exactly 64 characters", () => {
    expect(Notification.safeParse(row({ actor: "a".repeat(64) })).success).toBe(true);
  });

  it("drops what it does not know, such as a title the server should never send", () => {
    expect(Notification.parse(row({ title: "Büro" }))).not.toHaveProperty("title");
  });
});

describe("NotificationList", () => {
  it("takes the rows and the unread count, never a negative or fractional one", () => {
    const list = { notifications: [row()], unread: 1 };
    expect(NotificationList.parse(list)).toEqual(list);
    expect(NotificationList.safeParse({ ...list, unread: -1 }).success).toBe(false);
    expect(NotificationList.safeParse({ ...list, unread: 0.5 }).success).toBe(false);
  });
});

describe("preferences", () => {
  it("default to every kind as push, a fresh list each time", () => {
    const prefs = defaultNotificationPrefs();
    expect(prefs).toEqual({ push: [...NOTIFICATION_KINDS] });
    prefs.push.pop();
    expect(defaultNotificationPrefs().push).toHaveLength(NOTIFICATION_KINDS.length);
  });

  it("keep each kind once and refuse unknown ones", () => {
    expect(
      NotificationPrefs.parse({ push: ["link-opened", "link-opened", "root-changed"] }),
    ).toEqual({ push: ["link-opened", "root-changed"] });
    expect(NotificationPrefs.safeParse({ push: ["mail"] }).success).toBe(false);
  });

  it("say whether a kind goes out as push", () => {
    expect(wantsPush({ push: ["root-changed"] }, "root-changed")).toBe(true);
    expect(wantsPush({ push: ["root-changed"] }, "link-opened")).toBe(false);
  });
});

describe("PushSubscriptionWire", () => {
  it("takes an https address of up to 2048 characters and nothing else", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    expect(PushSubscriptionWire.parse({ endpoint, keys: { auth: "x" } })).toEqual({ endpoint });
    const long = `https://push.example/${"a".repeat(2048 - 21)}`;
    expect(long).toHaveLength(2048);
    expect(PushSubscriptionWire.safeParse({ endpoint: long }).success).toBe(true);
    expect(PushSubscriptionWire.safeParse({ endpoint: `${long}a` }).success).toBe(false);
    expect(PushSubscriptionWire.safeParse({ endpoint: "http://push.example/x" }).success).toBe(
      false,
    );
    expect(PushSubscriptionWire.safeParse({ endpoint: "not a url" }).success).toBe(false);
  });
});

describe("PushKey", () => {
  it("is a 65-byte P-256 point", () => {
    const point = new Uint8Array(65).fill(4);
    expect(PushKey.parse({ publicKey: encodeBytes(point) })).toEqual({ publicKey: point });
    expect(PushKey.safeParse({ publicKey: encodeBytes(new Uint8Array(64)) }).success).toBe(false);
  });
});
