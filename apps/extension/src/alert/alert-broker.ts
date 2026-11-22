/**
 * The service worker's side of the phishing warning (K-405, P-17). A content script asks for the
 * salt of the alert list and hands over the F-10 tag of what the user typed into a password field;
 * the worker never gets the typed value. It takes the tag only from a content script in a frame the
 * browser's frame tree shows as the top frame or a frame of the same origin as every frame above it
 * (fill/frames.ts), the same rule as for filling and saving, and reads the host from that frame tree,
 * never from the message.
 *
 * It warns when the tag matches a saved password and none of the entries with that password is for
 * this exact host (page/matches.ts, compared as host tags): it holds the warning for the tab, as it
 * holds a submitted login (save/captures.ts), and asks the top frame's content script to open the
 * prompt frame, whose page takes the warning once. Once per tab, page host and password while the
 * account stays unlocked. While locked there is no list, so nothing is compared or warned.
 */
import { alertHostTag } from "@kennwort/crypto";
import type { Sender } from "../fill/broker.ts";
import { targetOf } from "../fill/broker.ts";
import { type FillTarget, type FrameInfo, fillTarget } from "../fill/frames.ts";
import { pageHost } from "../page/matches.ts";
import type { Captures } from "../save/captures.ts";
import { contentSender, said } from "../save/save-broker.ts";
import { ALERT_ITEM, KEYS_ITEM, type SessionArea } from "../session-keys.ts";
import { alertListOf, matchesOf, sameSite } from "./alert-list.ts";
import { fromHex, hex } from "./hex.ts";
import { type AlertAnswer, alertRequest, type Warning } from "./messages.ts";

export type AlertContentMessage = { type: "kennwort-alert-open" };

export type AlertBrokerDeps = {
  extensionId: string;
  area: SessionArea | undefined;
  frames: (tabId: number) => Promise<FrameInfo[] | undefined>;
  send: (tabId: number, message: AlertContentMessage, target: FillTarget) => Promise<unknown>;
  warnings: Captures<Warning>;
  /** F-10's host tag; tests pass a stand-in */
  hostTag?: (host: string, salt: Uint8Array) => Uint8Array;
};

const TOP = 0;
const WEB = new Set(["http:", "https:"]);

/**
 * The page's exact host for the warning (page/matches.ts), and also a host that names no site of
 * its own: a public suffix (s3.amazonaws.com, an EC2 name) or a single label. No entry is for such
 * a host, so a saved password typed there warns; to skip it would let a phishing page in a cloud
 * bucket slip through (review of K-405).
 */
const warnHost = (url: string) => {
  const host = pageHost(url);
  if (host) return host;
  try {
    const parsed = new URL(url);
    return WEB.has(parsed.protocol) ? parsed.hostname.replace(/\.$/, "") || undefined : undefined;
  } catch {
    return undefined;
  }
};
const refuse = (error: Extract<AlertAnswer, { ok: false }>["error"]): AlertAnswer => ({
  ok: false,
  error,
});

export const createAlertBroker = (deps: AlertBrokerDeps) => {
  const hostTag = deps.hostTag ?? alertHostTag;
  /** Tab, salt, host and tag of every warning given: one per page and password */
  const warned = new Set<string>();

  /** The list while unlocked; a list left over after a lock is taken away */
  const openList = async () => {
    const area = deps.area;
    if (!area) return undefined;
    try {
      const items = { ...(await area.get(KEYS_ITEM)), ...(await area.get(ALERT_ITEM)) };
      if (items[KEYS_ITEM] !== undefined) return alertListOf(items[ALERT_ITEM]);
      if (items[ALERT_ITEM] !== undefined) await area.remove(ALERT_ITEM);
    } catch {
      // An area that fails warns about nothing
    }
    return undefined;
  };

  const deliver = async (tabId: number, message: AlertContentMessage, target: FillTarget) => {
    try {
      return await deps.send(tabId, message, target);
    } catch {
      return undefined;
    }
  };

  const check = async (tag: string, sender: Sender, tabId: number, frameId: number) => {
    const frames = (await deps.frames(tabId).catch(() => undefined)) ?? [];
    const target = fillTarget(frames, frameId);
    if (!target.ok) return refuse(target.error);
    if (sender.documentId && target.value.documentId !== sender.documentId)
      return refuse("unknown-frame");
    const host = warnHost(target.value.url);
    if (!host) return refuse("no-page");
    const list = await openList();
    if (!list) return refuse("locked");
    const records = matchesOf(list, tag);
    if (records.length === 0) return refuse("no-match");
    if (sameSite(records, hex(hostTag(host, fromHex(list.salt))))) return refuse("same-site");
    const key = [tabId, list.salt, host, tag].join(" ");
    if (warned.has(key)) return refuse("warned");
    warned.add(key);
    deps.warnings.put(tabId, { host, url: target.value.url, entries: records.map((r) => r.id) });
    const topFrame = frames.find((frame) => frame.frameId === TOP);
    const opened = topFrame
      ? await deliver(tabId, { type: "kennwort-alert-open" }, targetOf(topFrame))
      : undefined;
    // The top frame opened the prompt: it takes the warning; else the next page asks on load
    if (said(opened)) deps.warnings.offer(tabId);
    return { ok: true } as const;
  };

  /** Answers one runtime message; undefined for one that is not the warning's */
  const broker = async (message: unknown, sender: Sender): Promise<AlertAnswer | undefined> => {
    const request = alertRequest(message);
    if (!request) return undefined;
    const content = contentSender(sender, deps.extensionId);
    if (!content) return refuse("not-content");
    if (request.type === "alert-check")
      return check(request.tag, sender, content.tabId, content.frameId);
    const list = await openList();
    return list ? { ok: true, salt: list.salt } : refuse("locked");
  };

  return Object.assign(broker, {
    /** A tab that closed keeps no warning */
    drop: (tabId: number) => {
      deps.warnings.drop(tabId);
      for (const key of warned) if (key.startsWith(`${tabId} `)) warned.delete(key);
    },
  });
};
