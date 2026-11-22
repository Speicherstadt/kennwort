import { describe, expect, it, vi } from "vitest";
import { memoryArea } from "../account/popup.test-kit.ts";
import type { Sender } from "../fill/broker.ts";
import type { FillTarget, FrameInfo } from "../fill/frames.ts";
import { createCaptures } from "../save/captures.ts";
import { ALERT_ITEM, KEYS_ITEM } from "../session-keys.ts";
import { createAlertBroker } from "./alert-broker.ts";
import { hex } from "./hex.ts";
import type { Warning } from "./messages.ts";

// K-405: the worker compares only tags: a typed tag that matches a saved password of another host
// raises one warning for the tab, a tag of a password saved for this very host raises none
const ID = "abcdefghijklmnopabcdefghijklmnop";
const SALT = "07".repeat(16);
const LOOK_ALIKE = "https://portal-weber-haustechnik.test/login";
const PORTAL = "https://portal.weber-haustechnik.test/login";
// A stand-in for the host tag of F-10, as the list was made with it
const hostTag = (host: string) => new TextEncoder().encode(host.padEnd(16, "-").slice(0, 16));
const tagOf = (host: string) => hex(hostTag(host));

const top = (url: string): FrameInfo => ({ frameId: 0, parentFrameId: -1, url, documentId: "d0" });
const foreign: FrameInfo = {
  frameId: 5,
  parentFrameId: 0,
  url: "https://ads.test/",
  documentId: "d5",
};

const setup = (url = LOOK_ALIKE, { unlocked = true, delivered = true } = {}) => {
  const area = memoryArea();
  if (unlocked) area.items.set(KEYS_ITEM, { "account-key": [1] });
  area.items.set(ALERT_ITEM, {
    salt: SALT,
    records: [
      {
        id: "portal",
        version: 1,
        tag: "0a0b0c0d",
        hosts: [tagOf("portal.weber-haustechnik.test")],
      },
      { id: "shop", version: 1, tag: "11111111", hosts: [tagOf("shop.weber-haustechnik.test")] },
    ],
  });
  const frames = [top(url), foreign];
  const warnings = createCaptures<Warning>({ now: () => 0, schedule: () => undefined });
  const send = vi.fn(async (_tab: number, _message: unknown, _target: FillTarget) =>
    delivered ? { ok: true } : undefined,
  );
  const broker = createAlertBroker({
    extensionId: ID,
    area,
    frames: async () => frames,
    send,
    warnings,
    hostTag: (host) => hostTag(host),
  });
  return { area, broker, send, warnings };
};

const content = (url = LOOK_ALIKE, frameId = 0, extra: Partial<Sender> = {}): Sender => ({
  id: ID,
  url,
  frameId,
  documentId: `d${frameId}`,
  tab: { id: 3 },
  ...extra,
});
const check = (tag: string) => ({ type: "alert-check", tag });

describe("the alert broker", () => {
  it("hands the salt to a content script while unlocked, never while locked", async () => {
    expect(await setup().broker({ type: "alert-salt" }, content())).toEqual({
      ok: true,
      salt: SALT,
    });
    expect(
      await setup(LOOK_ALIKE, { unlocked: false }).broker({ type: "alert-salt" }, content()),
    ).toEqual({
      ok: false,
      error: "locked",
    });
  });

  it("warns once for a saved password typed on a look-alike host, and opens the top frame's prompt", async () => {
    const { broker, send, warnings } = setup();
    expect(await broker(check("0a0b0c0d"), content())).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith(
      3,
      { type: "kennwort-alert-open" },
      {
        frameId: 0,
        documentId: "d0",
        url: LOOK_ALIKE,
      },
    );
    // Offered to the frame it opened in, so the prompt takes it once
    expect(warnings.take(3)).toEqual({
      host: "portal-weber-haustechnik.test",
      url: LOOK_ALIKE,
      entries: ["portal"],
    });
    expect(warnings.take(3)).toBeUndefined();
    // The same password on the same page warns once
    expect(await broker(check("0a0b0c0d"), content())).toEqual({ ok: false, error: "warned" });
  });

  it("keeps a warning for the next page when the top frame could not be reached", async () => {
    const { broker, warnings } = setup(LOOK_ALIKE, { delivered: false });
    expect(await broker(check("0a0b0c0d"), content())).toEqual({ ok: true });
    expect(warnings.take(3)).toBeUndefined();
    expect(warnings.offer(3)).toBe(true);
    expect(warnings.take(3)?.entries).toEqual(["portal"]);
  });

  // Review of K-405: a host that is itself a public suffix names no site of its own, so no entry can
  // be for it; a phishing page in a bucket there (s3.amazonaws.com, an EC2 name, a single label)
  // must warn, not slip through as "no page"
  it("warns on a page whose host is a public suffix or a single label", async () => {
    for (const url of [
      "https://s3.amazonaws.com/weber-portal/login.html",
      "http://ec2-203-0-113-7.compute-1.amazonaws.com/login",
      "http://portal./login",
    ]) {
      const { broker, warnings } = setup(url);
      expect(await broker(check("0a0b0c0d"), content(url))).toEqual({ ok: true });
      expect(warnings.take(3)?.host).toBe(new URL(url).hostname.replace(/\.$/, ""));
    }
  });

  it("does not warn on the exact host of an entry with that password, nor for another password", async () => {
    const portal = setup(PORTAL);
    expect(await portal.broker(check("0a0b0c0d"), content(PORTAL))).toEqual({
      ok: false,
      error: "same-site",
    });
    expect(await setup().broker(check("99999999"), content())).toEqual({
      ok: false,
      error: "no-match",
    });
    expect(portal.send).not.toHaveBeenCalled();
  });

  it("does not warn while locked: no keys, no comparison, and the stale list goes", async () => {
    const { area, broker, send } = setup(LOOK_ALIKE, { unlocked: false });
    expect(await broker(check("0a0b0c0d"), content())).toEqual({ ok: false, error: "locked" });
    expect(send).not.toHaveBeenCalled();
    expect(area.items.has(ALERT_ITEM)).toBe(false);
  });

  it("takes checks only from content scripts of frames it may trust, by the frame tree", async () => {
    const { broker } = setup();
    expect(await broker(check("0a0b0c0d"), content("https://ads.test/", 5))).toEqual({
      ok: false,
      error: "foreign-frame",
    });
    expect(await broker(check("0a0b0c0d"), content(LOOK_ALIKE, 0, { documentId: "old" }))).toEqual({
      ok: false,
      error: "unknown-frame",
    });
    expect(await broker(check("0a0b0c0d"), content(LOOK_ALIKE, 0, { id: "other" }))).toEqual({
      ok: false,
      error: "not-content",
    });
    expect(
      await broker(check("0a0b0c0d"), { id: ID, url: `chrome-extension://${ID}/popup.html` }),
    ).toEqual({
      ok: false,
      error: "not-content",
    });
  });

  it("answers nothing for messages that are not its own, and nothing that carries a value", async () => {
    const { broker } = setup();
    expect(await broker({ type: "save-pending" }, content())).toBeUndefined();
    expect(
      await broker({ type: "alert-check", tag: "Kupfer-Rohr-18!" }, content()),
    ).toBeUndefined();
  });

  it("forgets the warnings of a tab that closed", async () => {
    const { broker, warnings } = setup();
    await broker(check("0a0b0c0d"), content());
    broker.drop(3);
    expect(warnings.take(3)).toBeUndefined();
    expect(await broker(check("0a0b0c0d"), content())).toEqual({ ok: true });
  });
});
