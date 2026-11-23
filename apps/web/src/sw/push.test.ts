import { describe, expect, it } from "vitest";
import de from "../../../../messages/de.json";
import en from "../../../../messages/en.json";
import { openNotifications, pushLocale, pushNotification, pushTextsOf } from "./push.ts";

// K-602: the service worker's side of an empty push
const texts = pushTextsOf({ de, en });

describe("pushNotification", () => {
  it("says the same fixed text from the message files in the browser's language", () => {
    expect(pushNotification(["de-AT", "en"], texts)).toEqual({
      title: "Kennwort",
      options: {
        body: "Neue Mitteilung in Kennwort",
        icon: "/icons/icon-192.png",
        tag: "kennwort",
      },
    });
    expect(pushNotification(["en-GB"], texts).options.body).toBe("New notification in Kennwort");
  });

  it("takes the first of German and English the browser prefers, English without either", () => {
    expect(pushLocale(["fr-FR", "en-US", "de"])).toBe("en");
    expect(pushLocale(["fr", "DE-CH"])).toBe("de");
    expect(pushLocale(["fr", "it"])).toBe("en");
    expect(pushLocale([])).toBe("en");
  });

  it("refuses to build without both texts in both languages", () => {
    expect(() => pushTextsOf({ de: { push_title: "Kennwort" }, en })).toThrow("messages/de.json");
    expect(() => pushTextsOf({ de, en: { push_body: 1, push_title: "x" } })).toThrow(
      "messages/en.json",
    );
  });
});

describe("openNotifications", () => {
  const origin = "https://kennwort.weber.example";

  it("focuses a window of the app and leads it to the notifications", async () => {
    const steps: string[] = [];
    const windows = [
      {
        url: "https://other.example/",
        focus: async () => steps.push("wrong"),
        navigate: async () => steps.push("wrong"),
      },
      {
        url: `${origin}/entries`,
        focus: async () => steps.push("focus"),
        navigate: async (url: string) => steps.push(`navigate ${url}`),
      },
    ];
    await openNotifications({
      origin,
      windows: async () => windows,
      open: async () => steps.push("open"),
    });
    expect(steps).toEqual(["focus", `navigate ${origin}/notifications`]);
  });

  it("opens a new window there when none of the app is open", async () => {
    const opened: string[] = [];
    await openNotifications({
      origin,
      windows: async () => [],
      open: async (url) => opened.push(url),
    });
    expect(opened).toEqual([`${origin}/notifications`]);
  });
});
