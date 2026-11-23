import type { NotificationApi } from "@kennwort/client/session/notifications-api.ts";
import type { Notification, NotificationList } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import type { JSX } from "@solidjs/web";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Navigation } from "../navigation.ts";
import { withQueries } from "../queries.test-kit.tsx";
import type { Session } from "../session/session.ts";
import { NotificationBell } from "./bell.tsx";
import { NotificationsPage } from "./notifications-page.tsx";

// K-602: the bell with its count and the page with the list, against a recorded server
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const note = (id: string, over: Partial<Notification> = {}): Notification => ({
  id,
  kind: "invitation-accepted",
  subject: "inv",
  actor: "anna",
  createdAt: Date.UTC(2026, 10, 20, 9, 30),
  read: false,
  ...over,
});

const fakeServer = (notes: Notification[]) => {
  let list = notes;
  const calls: string[] = [];
  const answer = (): NotificationList => ({
    notifications: list,
    unread: list.filter((n) => !n.read).length,
  });
  const api: NotificationApi = {
    notifications: vi.fn(async () => answer()),
    markRead: async (token, id) => {
      calls.push(`read ${token} ${id}`);
      list = list.map((n) => (n.id === id ? { ...n, read: true } : n));
      return true;
    },
    markAllRead: async () => {
      calls.push("read all");
      list = list.map((n) => ({ ...n, read: true }));
      return true;
    },
    removeNotification: async (_token, id) => {
      calls.push(`delete ${id}`);
      list = list.filter((n) => n.id !== id);
      return true;
    },
    notificationPrefs: async () => ({ push: ["root-changed"] }),
    setNotificationPrefs: async () => true,
    pushKey: async () => undefined,
    subscribePush: async () => false,
    unsubscribePush: async () => false,
  };
  return { api, calls };
};

const session = { opened: () => ({ token: "tok" }) } as unknown as Session;
const nav = (go = vi.fn()) =>
  ({ route: () => ({ page: "notifications" }), go }) as unknown as Navigation;
const names = {
  person: (id: string) => ({ anna: "Anna" })[id],
  vault: () => undefined,
};

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  flush();
};
const mount = async (view: () => JSX.Element) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => withQueries(view), root);
  flush();
  await settle();
  return root;
};
const button = (root: ParentNode, name: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  );

describe("NotificationsPage", () => {
  it("lists what happened with the names this device knows, read one, read all, delete one", async () => {
    const server = fakeServer([note("n1"), note("n2", { kind: "link-opened", read: true })]);
    const deps = { api: server.api, session };
    const root = await mount(() => (
      <>
        <NotificationBell nav={nav()} deps={deps} variant="rail" />
        <NotificationsPage nav={nav()} deps={deps} names={names} />
      </>
    ));
    const items = () => [...root.querySelectorAll("ul[aria-label='Mitteilungen'] > li")];
    expect(items().map((li) => li.querySelector("a")?.textContent)).toEqual([
      "Anna hat deine Einladung angenommen. Vergleiche den Code und bestätige die Person.",
      "Einer deiner Einmal-Links wurde abgerufen.",
    ]);
    expect(items()[0]?.querySelector("a")?.getAttribute("href")).toBe("/members");
    const bell = () => root.querySelector("a[href='/notifications']");
    expect(bell()?.querySelector(".sr-only")?.textContent).toBe("Mitteilungen, 1 ungelesen");
    expect(bell()?.querySelector("[aria-hidden] span")?.textContent).toBe("1");

    button(root, "Gelesen")?.click();
    await settle();
    expect(server.calls).toEqual(["read tok n1"]);
    expect(bell()?.textContent).toBe("Mitteilungen");
    expect(button(root, "Gelesen")).toBeUndefined();
    expect(button(root, "Alle gelesen")).toBeUndefined();

    button(root, "Mitteilung löschen")?.click();
    await settle();
    expect(server.calls.at(-1)).toBe("delete n1");
    expect(items()).toHaveLength(1);
  });

  it("marks all read, and marks one read when its link is followed", async () => {
    const server = fakeServer([note("n1"), note("n2", { kind: "access-requested" })]);
    const go = vi.fn();
    const root = await mount(() => (
      <NotificationsPage nav={nav(go)} deps={{ api: server.api, session }} names={names} />
    ));
    root.querySelector<HTMLAnchorElement>("a[href='/vaults']")?.click();
    await settle();
    expect(go).toHaveBeenCalledWith("/vaults");
    expect(server.calls).toEqual(["read tok n2"]);
    button(root, "Alle gelesen")?.click();
    await settle();
    expect(server.calls.at(-1)).toBe("read all");
  });

  it("says when there is nothing, and offers the push kinds with the account's choice", async () => {
    const server = fakeServer([]);
    const root = await mount(() => (
      <NotificationsPage nav={nav()} deps={{ api: server.api, session }} names={names} />
    ));
    expect(root.textContent).toContain("Keine Mitteilungen.");
    const boxes = [...root.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes).toHaveLength(15);
    expect(boxes.filter((b) => b.checked)).toHaveLength(1);
    expect(root.textContent).toContain("Neuer Firmenschlüssel");
  });
});
