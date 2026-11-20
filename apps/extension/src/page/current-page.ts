/**
 * The address of the page the popup was opened over (K-402). With the activeTab permission the
 * browser reveals it only after the user clicked the extension's button, and only for that tab: the
 * extension cannot read any other tab's address. The tab is the active one of the last focused
 * normal window, so a popup opened in a window of its own still finds the page behind it.
 */

/** The part of chrome.windows and chrome.tabs this needs; tests pass a fake */
export type TabsApi = {
  windows: { getLastFocused(options: { windowTypes: "normal"[] }): Promise<{ id?: number }> };
  tabs: {
    query(info: { active: true; windowId: number }): Promise<{ url?: string }[]>;
  };
};

/** The browser's APIs, or undefined outside an extension */
export const browserTabs = (): TabsApi | undefined => {
  const chrome = (globalThis as { chrome?: Partial<TabsApi> }).chrome;
  return chrome?.windows && chrome.tabs ? (chrome as TabsApi) : undefined;
};

/** The page's address, or undefined when there is none the extension may read */
export const currentPageUrl = async (api: TabsApi | undefined): Promise<string | undefined> => {
  if (!api) return undefined;
  try {
    const window = await api.windows.getLastFocused({ windowTypes: ["normal"] });
    if (window.id === undefined) return undefined;
    const [tab] = await api.tabs.query({ active: true, windowId: window.id });
    return tab?.url;
  } catch {
    return undefined;
  }
};
