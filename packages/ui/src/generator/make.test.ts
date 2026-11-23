import { effLargeWords } from "@kennwort/core/words";
import { describe, expect, it } from "vitest";
import { bitsOf, makePassword, makeSecret } from "./make.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";

describe("making a secret", () => {
  it("makes a password with the settings", async () => {
    expect(await makeSecret(DEFAULT_SETTINGS)).toHaveLength(20);
    expect(makePassword({ length: 12, digits: false, symbols: false })).toMatch(/^[a-zA-Z]{12}$/);
  });

  it("follows the new options: no look-alikes, at least the asked digits and symbols", () => {
    for (let i = 0; i < 100; i++) {
      const made = makePassword({
        ...DEFAULT_SETTINGS.password,
        length: 10,
        avoidAmbiguous: true,
        minDigits: 4,
        minSymbols: 4,
      });
      expect(made).not.toMatch(/[0Oo1Iil|]/);
      expect(made.replace(/\D/g, "").length).toBeGreaterThanOrEqual(4);
      expect(made.replace(/[^!#$%&*+\-=?@^_]/g, "").length).toBeGreaterThanOrEqual(4);
    }
  });

  it("makes a passphrase from the EFF list, loaded on first use", async () => {
    const made = await makeSecret({
      ...DEFAULT_SETTINGS,
      kind: "passphrase",
      passphrase: { words: 4, separator: " ", capitalize: false, digit: false },
    });
    const parts = made.split(" ");
    expect(parts).toHaveLength(4);
    for (const word of parts) expect(effLargeWords).toContain(word);
  });

  it("knows the strength of both kinds, the list's size before it loads", () => {
    expect(bitsOf(DEFAULT_SETTINGS)).toBe(124);
    expect(bitsOf({ ...DEFAULT_SETTINGS, kind: "passphrase" })).toBe(64);
    expect(effLargeWords).toHaveLength(7776);
  });
});
