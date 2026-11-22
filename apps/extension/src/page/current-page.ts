/**
 * The address of the page the popup was opened over (K-402). With the activeTab permission the
 * browser reveals it only after the user clicked the extension's button, and only for that tab: the
 * extension cannot read any other tab's address. The tab is the active one of the last focused
 * normal window, so a popup opened in a window of its own still finds the page behind it. Firefox
 * for Android and Safari on iOS have no windows API (K-407); there it is the active tab of the
 * last focused window, the only one they have.
 */

type Query = { active: true; windowId: number } | { active: true; lastFocusedWindow: true };

/** The part of chrome.windows and chrome.tabs this needs; tests pass a fake */
export type TabsApi = {
  windows?: { getLastFocused(options: { windowTypes: "normal"[] }): Promise<{ id?: number }> };
  tabs: { query(info: Query): Promise<{ url?: string }[]> };
};

/** The browser's APIs, or undefined outside an extension */
export const browserTabs = (scope: typeof globalThis = globalThis): TabsApi | undefined => {
  const chrome = (scope as { chrome?: Partial<TabsApi> }).chrome;
  if (!chrome?.tabs) return undefined;
  return chrome.windows ? { windows: chrome.windows, tabs: chrome.tabs } : { tabs: chrome.tabs };
};

/** Which tab to ask for: the active one of the last focused normal window, where there are windows */
const activeTabQuery = async (api: TabsApi): Promise<Query | undefined> => {
  if (!api.windows) return { active: true, lastFocusedWindow: true };
  const window = await api.windows.getLastFocused({ windowTypes: ["normal"] });
  return window.id === undefined ? undefined : { active: true, windowId: window.id };
};

/** The page's address, or undefined when there is none the extension may read */
export const currentPageUrl = async (api: TabsApi | undefined): Promise<string | undefined> => {
  if (!api) return undefined;
  try {
    const query = await activeTabQuery(api);
    if (!query) return undefined;
    const [tab] = await api.tabs.query(query);
    return tab?.url;
  } catch {
    return undefined;
  }
};
