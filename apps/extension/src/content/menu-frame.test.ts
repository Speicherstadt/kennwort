// @vitest-environment-options {"settings":{"enableIframePageLoading":true}}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMenuFrame, hides, MENU_WIDTH, menuIsClear, menuPlacement } from "./menu-frame.ts";
import { type FrameWindow, mayOpenMenu } from "./same-origin.ts";

// K-403: the menu is an extension iframe in a closed shadow root, and the content script checks
// from the page's side that nothing covers or fades it before a fill (Tóth, DEF CON 33)
const NONCE = "0123456789abcdef0123456789abcdef";
// A blank page stands in for the menu page: happy-dom loads it without a network
const MENU_URL = "about:blank";

const box = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect;

const opaque = {
  opacity: "1",
  filter: "none",
  clipPath: "none",
  maskImage: "none",
  mixBlendMode: "normal",
  visibility: "visible",
  display: "block",
};

describe("menuPlacement", () => {
  const viewport = { width: 1280, height: 720 };

  it("puts the menu under the field", () => {
    expect(menuPlacement(box(100, 200, 240, 36), viewport, 120)).toEqual({ left: 100, top: 240 });
  });

  it("keeps it inside the viewport, above the field where there is no room below", () => {
    expect(menuPlacement(box(1200, 650, 60, 36), viewport, 120)).toEqual({
      left: 1280 - MENU_WIDTH - 8,
      top: 650 - 4 - 120,
    });
    expect(menuPlacement(box(-50, 10, 60, 36), viewport, 120).left).toBe(8);
  });
});

describe("hides", () => {
  it("lets an opaque, unfiltered element pass", () => {
    expect(hides(opaque)).toBe(false);
  });

  it.each([
    { opacity: "0" },
    { opacity: "0.99" },
    { filter: "opacity(0)" },
    { clipPath: "inset(50%)" },
    { maskImage: "linear-gradient(transparent, transparent)" },
    { webkitMaskImage: "url(x.png)" },
    { mixBlendMode: "multiply" },
    { visibility: "hidden" },
    { display: "none" },
  ])("catches %o", (trick) => {
    expect(hides({ ...opaque, ...trick })).toBe(true);
  });
});

describe("the menu frame", () => {
  beforeEach(() => {
    document.body.innerHTML = `<input id="pass" type="password">`;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const host of document.querySelectorAll("kennwort-menu")) host.remove();
    document.documentElement.style.opacity = "";
  });

  const openMenu = () => {
    const frame = createMenuFrame(document, MENU_URL, "Kennwort");
    frame.open(document.getElementById("pass") as HTMLElement, NONCE);
    const host = document.querySelector("kennwort-menu") as HTMLElement;
    return { frame, host };
  };

  it("holds the extension's menu page in a closed shadow root the page cannot open", () => {
    const attach = vi.spyOn(HTMLElement.prototype, "attachShadow");
    const { host } = openMenu();
    expect(attach).toHaveBeenCalledWith({ mode: "closed" });
    expect(host.shadowRoot).toBeNull();
    expect(host.querySelector("iframe")).toBeNull();
    const root = attach.mock.results[0]?.value as ShadowRoot;
    const iframe = root.querySelector("iframe");
    expect(iframe?.src).toBe(`${MENU_URL}#${NONCE}`);
    expect(host.getAttribute("popover")).toBe("manual");
    expect(host.style.getPropertyPriority("opacity")).toBe("important");
  });

  it("keeps one menu per document and removes it on close", () => {
    const { frame } = openMenu();
    frame.open(document.getElementById("pass") as HTMLElement, NONCE);
    expect(document.querySelectorAll("kennwort-menu")).toHaveLength(1);
    frame.close();
    expect(document.querySelectorAll("kennwort-menu")).toHaveLength(0);
    expect(frame.isClear()).toBe(false);
  });

  describe("menuIsClear", () => {
    // happy-dom computes no opacity where none is set; a browser always reports one
    const shown = (host: HTMLElement, hit: (x: number, y: number) => Element | null) => {
      document.documentElement.style.opacity = "1";
      vi.spyOn(host, "matches").mockImplementation((selector) => selector === ":popover-open");
      vi.spyOn(host, "getBoundingClientRect").mockReturnValue(box(100, 240, MENU_WIDTH, 120));
      vi.spyOn(document, "elementFromPoint").mockImplementation(hit);
    };

    it("is clear when the page's hit test finds the menu everywhere", () => {
      const { host } = openMenu();
      shown(host, () => host);
      expect(menuIsClear(host)).toBe(true);
    });

    it("is not clear when the page covers a part of it", () => {
      const { host } = openMenu();
      const cover = document.createElement("div");
      shown(host, (x, y) => (x > 300 && y > 300 ? cover : host));
      expect(menuIsClear(host)).toBe(false);
    });

    it("is not clear when the page fades it or an ancestor", () => {
      const { host } = openMenu();
      shown(host, () => host);
      document.documentElement.style.opacity = "0.5";
      expect(menuIsClear(host)).toBe(false);
      document.documentElement.style.opacity = "1";
      host.style.setProperty("opacity", "0", "important");
      expect(menuIsClear(host)).toBe(false);
    });

    /** What the page's top layer holds, by the selector that finds it */
    const topLayerHolds = (layers: Record<string, Element[]>) =>
      vi
        .spyOn(document, "querySelectorAll")
        .mockImplementation(
          (selector: string) => (layers[selector] ?? []) as unknown as NodeListOf<Element>,
        );

    it("is not clear when the page puts something into the top layer after the menu opened", () => {
      const { host, frame } = openMenu();
      shown(host, () => host);
      const later = document.createElement("div");
      // A cover that lets clicks through to the menu escapes the hit test, not this check
      topLayerHolds({ ":popover-open": [host, later] });
      expect(frame.isClear()).toBe(false);
      topLayerHolds({ ":popover-open": [host] });
      expect(frame.isClear()).toBe(true);
    });

    it("stays clear with what was in the top layer before the menu, such as a modal dialog", () => {
      const dialog = document.createElement("dialog");
      topLayerHolds({ ":modal": [dialog] });
      const { host, frame } = openMenu();
      shown(host, () => host);
      topLayerHolds({ ":modal": [dialog], ":popover-open": [host] });
      expect(frame.isClear()).toBe(true);
    });

    it("is not clear outside the top layer, outside the viewport or detached", () => {
      const { host } = openMenu();
      shown(host, () => host);
      vi.spyOn(host, "matches").mockReturnValue(false);
      expect(menuIsClear(host)).toBe(false);
      vi.spyOn(host, "matches").mockImplementation((selector) => selector === ":popover-open");
      vi.spyOn(host, "getBoundingClientRect").mockReturnValue(box(-10, 240, MENU_WIDTH, 120));
      expect(menuIsClear(host)).toBe(false);
      host.remove();
      expect(menuIsClear(host)).toBe(false);
    });
  });
});

describe("mayOpenMenu", () => {
  const frameWindow = (origin: string, parent?: FrameWindow): FrameWindow => {
    const win = { location: { origin } } as FrameWindow;
    win.parent = parent ?? win;
    win.top = parent ? parent.top : win;
    return win;
  };
  const crossOrigin = (inner: string): FrameWindow => {
    const top = frameWindow("https://portal.weber-haustechnik.test");
    Object.defineProperty(top, "location", {
      get: () => {
        throw new DOMException(
          "Blocked a frame from accessing a cross-origin frame",
          "SecurityError",
        );
      },
    });
    return frameWindow(inner, top);
  };

  it("opens in the top frame and in a frame of the same origin as all above it", () => {
    const top = frameWindow("https://portal.weber-haustechnik.test");
    expect(mayOpenMenu(top)).toBe(true);
    const inner = frameWindow("https://portal.weber-haustechnik.test", top);
    expect(mayOpenMenu(frameWindow("https://portal.weber-haustechnik.test", inner))).toBe(true);
  });

  it("does not open in a frame of another origin, nor below one", () => {
    expect(mayOpenMenu(crossOrigin("https://login-widget.test"))).toBe(false);
    const top = frameWindow("https://portal.weber-haustechnik.test");
    const foreign = frameWindow("https://evil.test", top);
    expect(mayOpenMenu(frameWindow("https://portal.weber-haustechnik.test", foreign))).toBe(false);
  });

  it("does not open in a sandboxed frame with an opaque origin", () => {
    expect(mayOpenMenu(frameWindow("null"))).toBe(false);
  });
});
