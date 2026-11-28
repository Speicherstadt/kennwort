/**
 * Light, dark or like the system: a per-device convenience kept in localStorage (nothing secret);
 * a storage that throws (private mode, blocked) falls back to the system setting
 */
export type Theme = "system" | "light" | "dark";
const KEY = "kennwort-theme";

export const readTheme = (storage: Pick<Storage, "getItem"> | undefined): Theme => {
  try {
    const value = storage?.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
};

const THEME_COLORS = { light: "#ffffff", dark: "#09090b" } as const;

const syncThemeColor = (theme: Theme, root: HTMLElement) => {
  const head = root.ownerDocument?.head;
  if (!head) return;
  const existing = head.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-manual]');
  if (theme === "system") {
    existing?.remove();
    return;
  }
  const meta = existing ?? root.ownerDocument.createElement("meta");
  meta.name = "theme-color";
  meta.dataset.manual = "";
  meta.content = THEME_COLORS[theme];
  if (!existing) {
    const first = head.querySelector('meta[name="theme-color"]');
    head.insertBefore(meta, first);
  }
};

export const applyTheme = (
  theme: Theme,
  root: HTMLElement,
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined,
) => {
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  syncThemeColor(theme, root);
  try {
    if (theme === "system") storage?.removeItem(KEY);
    else storage?.setItem(KEY, theme);
  } catch {
    // Not remembered on this device; the choice still holds until the page is closed
  }
};
