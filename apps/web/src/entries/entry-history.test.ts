import type { EntryContent } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { capHistory, HISTORY_PER_FIELD, historyAfter, replacedSecrets } from "./entry-history.ts";

// K-306 part 5: earlier passwords, at most HISTORY_PER_FIELD per field
const login: EntryContent = {
  type: "login",
  title: "Sparkasse",
  fields: [
    { id: "username", name: "", value: "weber", kind: "text" },
    { id: "password", name: "", value: "alt-1", kind: "secret" },
    { id: "c-pin", name: "PIN", value: "1234", kind: "secret" },
    { id: "c-empty", name: "Frei", value: "", kind: "secret" },
  ],
  tags: [],
  favorite: false,
  history: [],
};
const field = (id: string, value: string) =>
  login.fields.map((f) => (f.id === id ? { ...f, value } : f));

describe("replaced secrets", () => {
  it("keeps the old value of a secret field the change replaced or cleared", () => {
    expect(replacedSecrets(login, field("password", "neu-2"), 7)).toEqual([
      { fieldId: "password", value: "alt-1", replacedAt: 7 },
    ]);
    expect(replacedSecrets(login, field("c-pin", ""), 7)).toEqual([
      { fieldId: "c-pin", value: "1234", replacedAt: 7 },
    ]);
  });

  it("keeps nothing for a field that is not secret, unchanged, was empty or was removed", () => {
    expect(replacedSecrets(login, field("username", "anna"), 7)).toEqual([]);
    expect(replacedSecrets(login, login.fields, 7)).toEqual([]);
    expect(replacedSecrets(login, field("c-empty", "neu"), 7)).toEqual([]);
    expect(
      replacedSecrets(
        login,
        login.fields.filter((f) => f.id !== "c-pin"),
        7,
      ),
    ).toEqual([]);
  });
});

describe("history cap", () => {
  const items = (fieldId: string, count: number) =>
    Array.from({ length: count }, (_, i) => ({ fieldId, value: `${fieldId}-${i}`, replacedAt: i }));

  it("keeps the newest values of each field, in the history's order", () => {
    const history = [...items("password", HISTORY_PER_FIELD + 2), ...items("title", 3)];
    const capped = capHistory(history);
    expect(capped).toEqual([
      ...items("password", HISTORY_PER_FIELD + 2).slice(2),
      ...items("title", 3),
    ]);
    expect(HISTORY_PER_FIELD).toBe(10);
  });

  it("counts by time, not by place: an older value later in the list goes first", () => {
    const history = [
      ...items("password", HISTORY_PER_FIELD).map((i) => ({ ...i, replacedAt: i.replacedAt + 10 })),
      { fieldId: "password", value: "oldest", replacedAt: 0 },
    ];
    expect(capHistory(history).map((i) => i.value)).not.toContain("oldest");
    expect(capHistory(history)).toHaveLength(HISTORY_PER_FIELD);
  });

  it("adds the replaced values to what the entry had, and starts a new entry without", () => {
    const before = { ...login, history: items("password", HISTORY_PER_FIELD) };
    const after = historyAfter(before, field("password", "neu"), 100);
    expect(after).toHaveLength(HISTORY_PER_FIELD);
    expect(after.at(-1)).toEqual({ fieldId: "password", value: "alt-1", replacedAt: 100 });
    expect(after[0]?.value).toBe("password-1");
    expect(historyAfter(undefined, login.fields, 100)).toEqual([]);
  });

  it("keeps the value a change just replaced, even when the history's times lie ahead of this device's clock", () => {
    // Another device with a clock ahead, or a merge in the same second, stamped the ten kept values
    // at or after `now`; the password this change replaces must still show under „Frühere Passwörter“
    const ahead = items("password", HISTORY_PER_FIELD).map((i) => ({
      ...i,
      replacedAt: 500 + i.replacedAt,
    }));
    const after = historyAfter({ ...login, history: ahead }, field("password", "neu"), 100);
    expect(after).toHaveLength(HISTORY_PER_FIELD);
    expect(after).toContainEqual({ fieldId: "password", value: "alt-1", replacedAt: 100 });
    const same = items("password", HISTORY_PER_FIELD).map((i) => ({ ...i, replacedAt: 100 }));
    expect(historyAfter({ ...login, history: same }, field("password", "neu"), 100)).toContainEqual(
      {
        fieldId: "password",
        value: "alt-1",
        replacedAt: 100,
      },
    );
  });
});
