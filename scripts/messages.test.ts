import { describe, expect, it } from "vitest";
import { missingKeys, unusedMessages } from "./messages.ts";

describe("the Paraglide messages (bunx checks, i18n)", () => {
  it("finds a message no code uses", () => {
    const code = 'm.vault_title()\nconst x = m["entry_save"]();\n// vault_titles is another word';
    expect(unusedMessages(["vault_title", "entry_save", "notifications_open"], code)).toEqual([
      "notifications_open",
    ]);
  });

  it("counts a key only as a whole word, never as part of a longer one", () => {
    expect(unusedMessages(["vault"], "m.vault_title()")).toEqual(["vault"]);
  });

  it("leaves out the schema entry", () => {
    expect(unusedMessages(["$schema"], "")).toEqual([]);
  });

  it("names keys that only one language has", () => {
    expect(missingKeys({ a: "A", b: "B" }, { a: "A", c: "C" })).toEqual(["b", "c"]);
  });
});
