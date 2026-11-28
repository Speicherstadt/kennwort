import { describe, expect, it } from "vitest";
import { applyTheme, readTheme } from "./theme.ts";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};
const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("theme", () => {
  it("remembers light and dark and forgets the system setting", () => {
    const storage = memory();
    const root = document.createElement("html");
    expect(readTheme(storage)).toBe("system");
    applyTheme("dark", root, storage);
    expect([root.dataset.theme, readTheme(storage)]).toEqual(["dark", "dark"]);
    applyTheme("system", root, storage);
    expect([root.dataset.theme, readTheme(storage)]).toEqual([undefined, "system"]);
    storage.setItem("kennwort-theme", "purple");
    expect(readTheme(storage)).toBe("system");
  });

  it("works without a storage or with one that throws", () => {
    const root = document.createElement("html");
    expect(readTheme(undefined)).toBe("system");
    expect(readTheme(broken)).toBe("system");
    applyTheme("light", root, broken);
    expect(root.dataset.theme).toBe("light");
    applyTheme("system", root, undefined);
    expect(root.dataset.theme).toBeUndefined();
  });

  it("updates a manual theme-color meta tag ahead of media metas", () => {
    const media = document.createElement("meta");
    media.name = "theme-color";
    media.media = "(prefers-color-scheme: light)";
    media.content = "#ffffff";
    document.head.append(media);
    try {
      applyTheme("dark", document.documentElement, undefined);
      const metas = [
        ...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
      ];
      expect(metas[0]?.dataset.manual).toBe("");
      expect(metas[0]?.content).toBe("#09090b");
      applyTheme("light", document.documentElement, undefined);
      expect(metas[0]?.content).toBe("#ffffff");
      applyTheme("system", document.documentElement, undefined);
      expect(document.head.querySelector('meta[name="theme-color"][data-manual]')).toBeNull();
    } finally {
      media.remove();
      document.head.querySelector('meta[name="theme-color"][data-manual]')?.remove();
    }
  });
});
