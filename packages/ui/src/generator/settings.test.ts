import { MIN_COUNT } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings, readSettings, writeSettings } from "./settings.ts";

const memory = () => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
};
const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("generator settings", () => {
  it("are a password of 20 with digits and symbols, or five words apart by a hyphen", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      kind: "password",
      password: {
        length: 20,
        digits: true,
        symbols: true,
        avoidAmbiguous: false,
        minDigits: 1,
        minSymbols: 1,
      },
      passphrase: { words: 5, separator: "-", capitalize: false, digit: false },
    });
  });

  it("are remembered on the device and read back", () => {
    const storage = memory();
    const mine = {
      kind: "passphrase" as const,
      password: {
        length: 32,
        digits: false,
        symbols: true,
        avoidAmbiguous: true,
        minDigits: 0,
        minSymbols: 4,
      },
      passphrase: { words: 7, separator: " ", capitalize: true, digit: true },
    };
    writeSettings(storage, mine);
    expect(readSettings(storage)).toEqual(mine);
  });

  it("fall back field by field when something does not fit", () => {
    expect(
      parseSettings({
        kind: "pin",
        password: { length: 7, digits: "yes", symbols: false },
        passphrase: { words: 11, separator: "/", capitalize: 1, digit: true },
      }),
    ).toEqual({
      kind: "password",
      password: {
        length: 20,
        digits: true,
        symbols: false,
        avoidAmbiguous: false,
        minDigits: 1,
        minSymbols: 1,
      },
      passphrase: { words: 5, separator: "-", capitalize: false, digit: true },
    });
    expect(parseSettings({ password: { length: 64 }, passphrase: { words: 3 } })).toMatchObject({
      password: { length: 64 },
      passphrase: { words: 3 },
    });
    expect(parseSettings({ password: { length: 12.5 } }).password.length).toBe(20);
    for (const value of [undefined, null, 5, "x"])
      expect(parseSettings(value)).toEqual(DEFAULT_SETTINGS);
  });

  it("load settings stored before the new options, each new one at its default", () => {
    const storage = memory();
    storage.setItem(
      "kennwort-generator",
      JSON.stringify({ kind: "password", password: { length: 16, digits: true, symbols: false } }),
    );
    expect(readSettings(storage).password).toEqual({
      length: 16,
      digits: true,
      symbols: false,
      avoidAmbiguous: false,
      minDigits: MIN_COUNT.initial,
      minSymbols: MIN_COUNT.initial,
    });
    expect(
      parseSettings({ password: { avoidAmbiguous: "no", minDigits: 10, minSymbols: -1 } }).password,
    ).toMatchObject({ avoidAmbiguous: false, minDigits: 1, minSymbols: 1 });
    expect(parseSettings({ password: { minDigits: 9, minSymbols: 0 } }).password).toMatchObject({
      minDigits: 9,
      minSymbols: 0,
    });
  });

  it("are the defaults when the storage is empty, blocked, missing or holds no JSON", () => {
    const broken = memory();
    broken.setItem("kennwort-generator", "{");
    for (const storage of [memory(), throwing, undefined, broken])
      expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(() => writeSettings(throwing, DEFAULT_SETTINGS)).not.toThrow();
  });
});
