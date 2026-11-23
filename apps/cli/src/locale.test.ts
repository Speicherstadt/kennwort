import { describe, expect, it } from "vitest";
import { localeOf } from "./locale.ts";

describe("the language of the CLI", () => {
  it.each([
    [{ LANG: "de_DE.UTF-8" }, "de"],
    [{ LANG: "de_AT" }, "de"],
    [{ LANG: "en_GB.UTF-8" }, "en"],
    [{ LANG: "de_DE.UTF-8", LC_MESSAGES: "en_US.UTF-8" }, "en"],
    [{ LANG: "en_US.UTF-8", LC_MESSAGES: "de_CH.UTF-8", LC_ALL: "" }, "de"],
    [{ LANG: "en_US.UTF-8", LC_ALL: "de_DE.UTF-8" }, "de"],
  ])("follows the locale settings in POSIX order: %j", (env, locale) => {
    expect(localeOf(env)).toBe(locale);
  });

  it.each([{}, { LANG: "C" }, { LANG: "POSIX" }, { LANG: "fr_FR.UTF-8" }, { LANG: "C.UTF-8" }])(
    "speaks English where no German is asked for: %j",
    (env) => {
      expect(localeOf(env)).toBe("en");
    },
  );
});
