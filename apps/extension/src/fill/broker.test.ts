import { describe, expect, it, vi } from "vitest";
import { type BrokerDeps, createFillBroker, type Sender } from "./broker.ts";
import type { FillTarget, FrameInfo } from "./frames.ts";
import type { ContentMessage } from "./messages.ts";

// K-403: the service worker answers only the extension's menu page, finds the frame whose content
// script opened the menu in the tab's frame tree at the time of each request, and sends a password
// only to that document
const ID = "abcdefghijklmnopabcdefghijklmnop";
const NONCE = "0123456789abcdef0123456789abcdef";
const PORTAL = "https://portal.weber-haustechnik.test/login";
const MENU_URL = `chrome-extension://${ID}/src/menu/menu.html#${NONCE}`;

/**
 * The tab's content scripts: the one in `owner` opened the menu and answers for its nonce; every
 * other message gets `answer`
 */
const setup = (frames: FrameInfo[] | undefined, owner = 0, answer: unknown = { ok: true }) => {
  const deps = {
    extensionId: ID,
    menuPath: "/src/menu/menu.html",
    frames: vi.fn(async (_tab: number) => frames),
    send: vi.fn(
      async (_tab: number, message: ContentMessage, target: FillTarget): Promise<unknown> => {
        if (message.type !== "kennwort-owns") return answer;
        if (target.frameId !== owner || message.nonce !== NONCE)
          throw new Error("Could not establish connection. Receiving end does not exist.");
        return { ok: true };
      },
    ),
    openPopup: vi.fn(async () => {}),
  } satisfies BrokerDeps;
  /** What reached a content script besides the question who opened the menu */
  const delivered = () =>
    deps.send.mock.calls.filter(([, message]) => message.type !== "kennwort-owns");
  return { deps, delivered, broker: createFillBroker(deps) };
};
const topFrames = (url = PORTAL): FrameInfo[] => [
  { frameId: 0, parentFrameId: -1, url, documentId: "doc-top" },
];
const menu: Sender = { id: ID, url: MENU_URL, frameId: 7, tab: { id: 3 } };
const fill = (addresses = [PORTAL]) => ({
  type: "menu-fill",
  nonce: NONCE,
  addresses,
  username: "jonas.weber",
  password: "Kupfer-Rohr-17!",
});

describe("the fill broker", () => {
  it("tells the menu the exact host of the frame that opened it", async () => {
    const { broker, deps } = setup(topFrames());
    expect(await broker({ type: "menu-page", nonce: NONCE }, menu)).toEqual({
      ok: true,
      host: "portal.weber-haustechnik.test",
    });
    expect(deps.frames).toHaveBeenCalledWith(3);
  });

  it("sends the login to the checked frame's document only", async () => {
    const { broker, delivered } = setup(topFrames());
    expect(await broker(fill(), menu)).toEqual({ ok: true });
    expect(delivered()).toEqual([
      [
        3,
        {
          type: "kennwort-fill",
          nonce: NONCE,
          host: "portal.weber-haustechnik.test",
          username: "jonas.weber",
          password: "Kupfer-Rohr-17!",
        },
        { frameId: 0, documentId: "doc-top", url: PORTAL },
      ],
    ]);
  });

  it("finds the menu's frame among several by asking their content scripts", async () => {
    const frames: FrameInfo[] = [
      ...topFrames(),
      { frameId: 4, parentFrameId: 0, url: "https://portal.weber-haustechnik.test/sso" },
      { frameId: 5, parentFrameId: 0, url: "about:blank" },
    ];
    const { broker, deps, delivered } = setup(frames, 4);
    expect(await broker(fill(), menu)).toEqual({ ok: true });
    expect(delivered()[0]?.[2]).toEqual({
      frameId: 4,
      url: "https://portal.weber-haustechnik.test/sso",
    });
    // about:blank runs no content script and is not asked
    const asked = deps.send.mock.calls.map(([, , target]) => target.frameId);
    expect(asked).not.toContain(5);
  });

  it("refuses when no frame or more than one claims the menu", async () => {
    const { broker, delivered } = setup(topFrames(), 9);
    expect(await broker(fill(), menu)).toEqual({ ok: false, error: "unknown-frame" });
    const twice = setup([...topFrames(), { frameId: 1, parentFrameId: 0, url: PORTAL }]);
    twice.deps.send.mockImplementation(async () => ({ ok: true }));
    expect(await twice.broker(fill(), menu)).toEqual({ ok: false, error: "unknown-frame" });
    expect(delivered()).toEqual([]);
    expect(twice.delivered()).toEqual([]);
  });

  it("checks the frame's address at fill time, not when the menu opened", async () => {
    const { broker, deps, delivered } = setup(topFrames());
    deps.frames.mockResolvedValueOnce(topFrames("https://portal-weber-haustechnik.test/login"));
    expect(await broker(fill(), menu)).toEqual({ ok: false, error: "no-match" });
    expect(delivered()).toEqual([]);
  });

  it.each([
    "https://portal.weber-haustechnik.test.evil.test/login",
    "https://www.portal.weber-haustechnik.test/",
    "http://portal.weber-haustechnik.test/login",
  ])("sends nothing to %s", async (url) => {
    const { broker, delivered } = setup(topFrames(url));
    expect(await broker(fill(), menu)).toEqual({ ok: false, error: "no-match" });
    expect(delivered()).toEqual([]);
  });

  it("sends nothing into a foreign frame on a matching page", async () => {
    const frames: FrameInfo[] = [
      { frameId: 0, parentFrameId: -1, url: PORTAL },
      { frameId: 2, parentFrameId: 0, url: "https://portal.weber-haustechnik.test:8443/" },
    ];
    const { broker, delivered } = setup(frames, 2);
    expect(await broker(fill(["https://portal.weber-haustechnik.test:8443/"]), menu)).toEqual({
      ok: false,
      error: "foreign-frame",
    });
    expect(await broker({ type: "menu-page", nonce: NONCE }, menu)).toEqual({
      ok: false,
      error: "foreign-frame",
    });
    expect(delivered()).toEqual([]);
  });

  it.each<[string, Sender]>([
    ["a content script", { id: ID, url: PORTAL, frameId: 7, tab: { id: 3 } }],
    ["another extension", { id: "other", url: MENU_URL, frameId: 7, tab: { id: 3 } }],
    ["another page of the extension", { ...menu, url: `chrome-extension://${ID}/popup.html` }],
    ["the menu outside a tab", { id: ID, url: MENU_URL, frameId: 7 }],
    ["the menu as a top frame", { ...menu, frameId: 0 }],
  ])("answers %s with a refusal", async (_name, sender) => {
    const { broker, deps } = setup(topFrames());
    expect(await broker(fill(), sender)).toEqual({ ok: false, error: "not-menu" });
    expect(deps.frames).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("ignores messages that are not the menu's", async () => {
    const { broker } = setup(topFrames());
    expect(await broker({ type: "menu-fill", nonce: "short" }, menu)).toBeUndefined();
    expect(await broker("hello", menu)).toBeUndefined();
    expect(await broker({ ...fill(), addresses: [1] }, menu)).toBeUndefined();
  });

  it("passes on what the content script refuses, and a failed delivery", async () => {
    const hidden = setup(topFrames(), 0, { ok: false, error: "menu-hidden" });
    expect(await hidden.broker(fill(), menu)).toEqual({ ok: false, error: "menu-hidden" });
    expect(await setup(topFrames(), 0, null).broker(fill(), menu)).toEqual({
      ok: false,
      error: "not-delivered",
    });
    expect(await setup(topFrames(), 0, "?").broker(fill(), menu)).toEqual({
      ok: false,
      error: "not-delivered",
    });
  });

  it("refuses when the frame tree cannot be read", async () => {
    const { broker, deps } = setup(undefined);
    expect(await broker(fill(), menu)).toEqual({ ok: false, error: "unknown-frame" });
    deps.frames.mockRejectedValueOnce(new Error("no tab"));
    expect(await broker(fill(), menu)).toEqual({ ok: false, error: "unknown-frame" });
  });

  it("passes size and close on to the menu's frame", async () => {
    const { broker, delivered } = setup(topFrames());
    await broker({ type: "menu-size", nonce: NONCE, height: 180 }, menu);
    await broker({ type: "menu-close", nonce: NONCE }, menu);
    expect(delivered().map(([, message]) => message)).toEqual([
      { type: "kennwort-menu-size", nonce: NONCE, height: 180 },
      { type: "kennwort-menu-close", nonce: NONCE },
    ]);
  });

  it("opens the popup to unlock", async () => {
    const { broker, deps } = setup(topFrames());
    expect(await broker({ type: "menu-unlock" }, menu)).toEqual({ ok: true });
    expect(deps.openPopup).toHaveBeenCalled();
  });
});
