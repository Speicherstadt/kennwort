import type { EntryContent } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { type ShownEntry, shown } from "./entries.ts";
import { checkedPasswords, markToChange, toChange } from "./to-change.ts";

// K-306 part 5: weak and reused passwords, found in memory on the device
const entry = (id: string, type: EntryContent["type"], fields: EntryContent["fields"]) =>
  shown({
    idText: id,
    vaultIdText: "v",
    role: "edit",
    version: 1,
    content: { type, title: id, fields, tags: [], favorite: false, history: [] },
  });
const secret = (id: string, value: string) => ({ id, name: id, value, kind: "secret" as const });
const marks = (entries: ShownEntry[]) =>
  Object.fromEntries(markToChange(entries).map((e) => [e.id, [e.weak, e.reused]]));

describe("Zum Ändern", () => {
  it("checks the types' passwords and an SSH passphrase, not PINs, keys or own secrets", () => {
    const card = entry("card", "card", [secret("pin", "1234"), secret("cvc", "123")]);
    const ssh = entry("ssh", "ssh-key", [secret("private-key", "k"), secret("passphrase", "pp")]);
    const own = entry("own", "login", [secret("c-x", "x"), secret("password", "")]);
    const totp = entry("totp", "login", [{ id: "password", name: "", value: "t", kind: "totp" }]);
    expect(checkedPasswords(card)).toEqual([]);
    expect(checkedPasswords(ssh)).toEqual(["pp"]);
    expect(checkedPasswords(own)).toEqual([]);
    expect(checkedPasswords(totp)).toEqual([]);
  });

  it("marks a weak password, and one used in more than one entry with the count", () => {
    const strong = "Heizung-Wasser-Licht-42";
    expect(
      marks([
        entry("bank", "login", [secret("password", strong)]),
        entry("wifi", "wifi", [secret("password", strong)]),
        entry("ssh", "ssh-key", [secret("passphrase", strong)]),
        entry("mail", "login", [secret("password", "sommer2019")]),
        entry("datev", "login", [secret("password", "Kessel-Rohr-Ventil-7")]),
        entry("empty", "login", [secret("password", "")]),
      ]),
    ).toEqual({
      bank: [false, 3],
      wifi: [false, 3],
      ssh: [false, 3],
      mail: [true, 0],
      datev: [false, 0],
      empty: [false, 0],
    });
  });

  it("counts an entry once, even with the same password in two of its fields", () => {
    const strong = "Heizung-Wasser-Licht-42";
    const both = entry("both", "login", [secret("password", strong), secret("passphrase", strong)]);
    expect(marks([both])).toEqual({ both: [false, 0] });
  });

  it("puts an entry under Zum Ändern when weak or reused", () => {
    const base = entry("x", "login", []);
    expect(toChange(base)).toBe(false);
    expect(toChange({ ...base, weak: true })).toBe(true);
    expect(toChange({ ...base, reused: 2 })).toBe(true);
  });
});
