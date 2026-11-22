import { describe, expect, it, vi } from "vitest";
import { openPopupWith } from "./open-popup.ts";

// The menu's and the save prompt's "open to unlock" (K-403, K-404): the popup over the tab where
// the browser allows it, else popup.html in a window of its own, and on Firefox for Android and
// Safari on iOS, which have no windows API, in a tab (K-407)
const WINDOW = { url: "popup.html", type: "popup", width: 360, height: 600 };

describe("opening the popup to unlock", () => {
  it("opens it over the tab where the browser allows that", async () => {
    const apis = {
      action: { openPopup: vi.fn(async () => {}) },
      windows: { create: vi.fn(async () => ({})) },
      tabs: { create: vi.fn(async () => ({})) },
    };
    await openPopupWith(apis)();
    expect(apis.action.openPopup).toHaveBeenCalledOnce();
    expect(apis.windows.create).not.toHaveBeenCalled();
    expect(apis.tabs.create).not.toHaveBeenCalled();
  });

  it("opens it in a window of its own where the browser refuses or lacks openPopup", async () => {
    const refusing = {
      action: { openPopup: vi.fn(async () => Promise.reject(new Error("no user gesture"))) },
      windows: { create: vi.fn(async () => ({})) },
      tabs: { create: vi.fn(async () => ({})) },
    };
    await openPopupWith(refusing)();
    expect(refusing.windows.create).toHaveBeenCalledWith(WINDOW);
    expect(refusing.tabs.create).not.toHaveBeenCalled();

    const old = { action: {}, windows: { create: vi.fn(async () => ({})) } };
    await openPopupWith(old)();
    expect(old.windows.create).toHaveBeenCalledWith(WINDOW);
  });

  it("opens it in a tab where there are no windows (Firefox for Android, Safari on iOS)", async () => {
    const phone = {
      action: { openPopup: vi.fn(async () => Promise.reject(new Error("no user gesture"))) },
      tabs: { create: vi.fn(async () => ({})) },
    };
    await openPopupWith(phone)();
    expect(phone.tabs.create).toHaveBeenCalledWith({ url: "popup.html" });
  });

  it("opens it in a tab when creating the window fails", async () => {
    const apis = {
      windows: { create: vi.fn(async () => Promise.reject(new Error("not supported"))) },
      tabs: { create: vi.fn(async () => ({})) },
    };
    await openPopupWith(apis)();
    expect(apis.tabs.create).toHaveBeenCalledWith({ url: "popup.html" });
  });
});
