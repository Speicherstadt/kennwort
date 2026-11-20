import { describe, expect, it, vi } from "vitest";
import { currentPageUrl, type TabsApi } from "./current-page.ts";

const fake = (url: string | undefined, window: { id?: number } = { id: 7 }): TabsApi => ({
  windows: { getLastFocused: vi.fn(async () => window) },
  tabs: { query: vi.fn(async () => [url === undefined ? {} : { url }]) },
});

describe("the page behind the popup", () => {
  it("is the active tab of the last focused normal window", async () => {
    const api = fake("https://portal.weber-haustechnik.test/login");
    expect(await currentPageUrl(api)).toBe("https://portal.weber-haustechnik.test/login");
    expect(api.windows.getLastFocused).toHaveBeenCalledWith({ windowTypes: ["normal"] });
    expect(api.tabs.query).toHaveBeenCalledWith({ active: true, windowId: 7 });
  });

  it("has no address when the browser does not reveal one (no click on the button)", async () => {
    expect(await currentPageUrl(fake(undefined))).toBeUndefined();
  });

  it("has no address without a window, without the APIs or when they fail", async () => {
    expect(await currentPageUrl(fake("https://a.test", {}))).toBeUndefined();
    expect(await currentPageUrl(undefined)).toBeUndefined();
    const failing: TabsApi = {
      windows: { getLastFocused: async () => Promise.reject(new Error("no window")) },
      tabs: { query: async () => [] },
    };
    expect(await currentPageUrl(failing)).toBeUndefined();
  });
});
