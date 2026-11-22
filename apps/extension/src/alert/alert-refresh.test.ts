import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import { describe, expect, it, vi } from "vitest";
import { memoryArea } from "../account/popup.test-kit.ts";
import { ALERT_ITEM, KEYS_ITEM } from "../session-keys.ts";
import { alertListOf } from "./alert-list.ts";
import { createAlertRefresh } from "./alert-refresh.ts";
import { hex } from "./hex.ts";

// K-405: pages of the extension that decrypted the entries keep the alert list up to date, only
// while unlocked, and never with a password or host in plain text
const login = (idText: string, password: string, version = 1): StoredEntry => ({
  idText,
  vaultIdText: "buero",
  role: "edit",
  version,
  content: {
    type: "login",
    title: idText,
    fields: [
      { id: "password", name: "", value: password, kind: "secret" },
      { id: "website", name: "", value: `https://${idText}.weber-haustechnik.test`, kind: "url" },
    ],
    tags: [],
    favorite: false,
    history: [],
  },
});

const setup = (unlocked = true) => {
  const area = memoryArea();
  if (unlocked) area.items.set(KEYS_ITEM, { "account-key": [1] });
  const tag = vi.fn((password: string) => Uint8Array.from([password.length, 1, 2, 3]));
  const hostTag = vi.fn((host: string) => new Uint8Array(16).fill(host.length));
  let draws = 0;
  const refresh = createAlertRefresh({
    area,
    random: (length) => new Uint8Array(length).fill(++draws),
    hashers: { tag, hostTag },
    pause: async () => {},
  });
  const list = () => alertListOf(area.items.get(ALERT_ITEM));
  return { area, tag, refresh, list };
};

describe("createAlertRefresh", () => {
  it("keeps a tag per saved password under a fresh salt, nothing in plain text", async () => {
    const { area, refresh, list } = setup();
    await refresh([login("portal", "Kupfer-Rohr-18!"), login("shop", "Shop-Kessel-1!")]);
    expect(list()?.salt).toBe(hex(new Uint8Array(16).fill(1)));
    expect(list()?.records.map((r) => [r.id, r.tag])).toEqual([
      ["portal", "0f010203"],
      ["shop", "0e010203"],
    ]);
    expect(JSON.stringify([...area.items])).not.toMatch(/Kupfer|Shop-Kessel|weber-haustechnik/);
  });

  it("keeps the salt and hashes again only entries that changed", async () => {
    const { refresh, list, tag } = setup();
    await refresh([login("portal", "Kupfer-Rohr-18!"), login("shop", "Shop-Kessel-1!")]);
    const salt = list()?.salt;
    tag.mockClear();
    await refresh([login("portal", "Kupfer-Rohr-19!!", 2), login("shop", "Shop-Kessel-1!")]);
    expect(list()?.salt).toBe(salt);
    expect(tag).toHaveBeenCalledOnce();
    expect(list()?.records.map((r) => r.tag)).toEqual(["10010203", "0e010203"]);
    // A deleted entry leaves the list
    await refresh([login("shop", "Shop-Kessel-1!")]);
    expect(list()?.records.map((r) => r.id)).toEqual(["shop"]);
  });

  it("writes nothing while locked, and takes the list away if the lock came during the work", async () => {
    const locked = setup(false);
    await locked.refresh([login("portal", "Kupfer-Rohr-18!")]);
    expect(locked.area.items.has(ALERT_ITEM)).toBe(false);

    const racing = setup();
    racing.tag.mockImplementation(() => {
      racing.area.items.delete(KEYS_ITEM);
      return Uint8Array.from([1, 2, 3, 4]);
    });
    await racing.refresh([login("portal", "Kupfer-Rohr-18!")]);
    expect(racing.area.items.has(ALERT_ITEM)).toBe(false);
  });

  it("works through calls one after the other, the newest entries last", async () => {
    const { refresh, list } = setup();
    const first = refresh([login("portal", "a")]);
    const second = refresh([login("portal", "b", 2)]);
    const third = refresh([login("portal", "cc", 3)]);
    await Promise.all([first, second, third]);
    expect(list()?.records.map((r) => r.tag)).toEqual(["02010203"]);
  });

  it("writes what it has every few passwords, so a page that closes early leaves a part", async () => {
    const { area, refresh } = setup();
    const writes: number[] = [];
    const set = area.set;
    area.set = async (items) => {
      writes.push((alertListOf(items[ALERT_ITEM])?.records ?? []).length);
      return set(items);
    };
    await refresh(Array.from({ length: 25 }, (_, i) => login(`e${i}`, `pw-${i}`)));
    expect(writes).toEqual([10, 20, 25]);
  });

  it("does nothing without a session area, and survives one that fails", async () => {
    const none = createAlertRefresh({ area: undefined, random: () => new Uint8Array(16) });
    await expect(none([login("portal", "x")])).resolves.toBeUndefined();
    const { area, refresh } = setup();
    area.get = async () => {
      throw new Error("gone");
    };
    await expect(refresh([login("portal", "x")])).resolves.toBeUndefined();
  });
});
