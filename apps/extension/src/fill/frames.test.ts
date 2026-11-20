import { describe, expect, it } from "vitest";
import { type FrameInfo, fillTarget, webFrames } from "./frames.ts";

// K-403: the service worker fills a frame only when it and every frame above it share one origin
// (P-17: never into a frame of another origin)
const PORTAL = "https://portal.weber-haustechnik.test/login";
const frame = (frameId: number, parentFrameId: number, url: string): FrameInfo => ({
  frameId,
  parentFrameId,
  url,
  documentId: `doc-${frameId}`,
});

describe("fillTarget", () => {
  it("fills the top frame, pinned to its document", () => {
    const frames = [frame(0, -1, PORTAL)];
    expect(fillTarget(frames, 0)).toEqual({
      ok: true,
      value: { frameId: 0, documentId: "doc-0", url: PORTAL },
    });
  });

  it("fills a frame of the same origin as every frame above it", () => {
    const frames = [
      frame(0, -1, PORTAL),
      frame(2, 0, "https://portal.weber-haustechnik.test/sso/frame"),
    ];
    expect(fillTarget(frames, 2)).toMatchObject({ ok: true, value: { frameId: 2 } });
  });

  it.each([
    ["a foreign frame on a matching page", PORTAL, "https://login-widget.test/form"],
    ["the matching site framed by a foreign page", "https://evil.test/", PORTAL],
    ["the same host over another scheme", PORTAL, "http://portal.weber-haustechnik.test/login"],
    ["the same host on another port", PORTAL, "https://portal.weber-haustechnik.test:8443/"],
  ])("refuses %s", (_case, top, inner) => {
    const frames = [frame(0, -1, top), frame(1, 0, inner)];
    expect(fillTarget(frames, 1)).toEqual({ ok: false, error: "foreign-frame" });
  });

  it("refuses a same-origin frame below a foreign one", () => {
    const frames = [frame(0, -1, PORTAL), frame(1, 0, "https://evil.test/"), frame(2, 1, PORTAL)];
    expect(fillTarget(frames, 2)).toEqual({ ok: false, error: "foreign-frame" });
  });

  it.each(["about:blank", "data:text/html,<form>", "chrome-extension://abc/popup.html"])(
    "refuses a frame that is no web page: %s",
    (url) => {
      const frames = [frame(0, -1, PORTAL), frame(1, 0, url)];
      expect(fillTarget(frames, 1)).toEqual({ ok: false, error: "no-page" });
    },
  );

  it("refuses an unknown frame, a missing parent and a loop", () => {
    expect(fillTarget([frame(0, -1, PORTAL)], 9)).toEqual({ ok: false, error: "unknown-frame" });
    const broken = [frame(1, 0, PORTAL)];
    expect(fillTarget(broken, 1)).toEqual({ ok: false, error: "unknown-frame" });
    const loop = [frame(1, 2, PORTAL), frame(2, 1, PORTAL)];
    expect(fillTarget(loop, 1)).toEqual({ ok: false, error: "unknown-frame" });
  });

  it("works without document IDs (Firefox)", () => {
    const frames = [{ frameId: 0, parentFrameId: -1, url: PORTAL }];
    expect(fillTarget(frames, 0)).toEqual({ ok: true, value: { frameId: 0, url: PORTAL } });
  });

  it("knows the web frames of a tab", () => {
    const frames = [
      frame(0, -1, PORTAL),
      frame(1, 0, "about:blank"),
      frame(2, 0, "https://a.test/"),
    ];
    expect(webFrames(frames).map((f) => f.frameId)).toEqual([0, 2]);
  });
});
