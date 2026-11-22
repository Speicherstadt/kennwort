/**
 * Opens the popup to unlock, for the inline menu and the save prompt (K-403, K-404): over the tab
 * where the browser allows it (chrome.action.openPopup; Firefox before 149 only on a user gesture),
 * else popup.html in a window of its own, and where there are no windows (Firefox for Android,
 * Safari on iOS; MDN browser-compat-data) in a tab (K-407). The popup holds nothing until the user
 * unlocks it there.
 */

const POPUP = "popup.html";

/** The parts of chrome.action, chrome.windows and chrome.tabs this needs; tests pass fakes */
export type PopupApis = {
  action?: { openPopup?: () => Promise<void> };
  windows?: { create(options: object): Promise<unknown> };
  tabs?: { create(options: { url: string }): Promise<unknown> };
};

const succeeds = (run: (() => Promise<unknown>) | undefined) =>
  run
    ? run().then(
        () => true,
        () => false,
      )
    : Promise.resolve(false);

export const openPopupWith = (apis: PopupApis) => async () => {
  const { action, windows, tabs } = apis;
  if (await succeeds(action?.openPopup?.bind(action))) return;
  const window = { url: POPUP, type: "popup", width: 360, height: 600 };
  if (await succeeds(windows && (() => windows.create(window)))) return;
  await tabs?.create({ url: POPUP });
};
