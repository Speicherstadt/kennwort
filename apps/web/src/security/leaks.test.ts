import { createHash } from "node:crypto";
import { shown } from "@kennwort/client/entries/entries.ts";
import { createLeakCheck, type FetchRange } from "@kennwort/core";
import { createRoot, flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { markToChange } from "../entries/to-change.ts";
import { createLeaks } from "./leaks.ts";

// K-603: the leak check as the security page runs it
const sha1 = (text: string) => createHash("sha1").update(text).digest("hex").toUpperCase();
const login = (id: string, password: string, sharedBy?: string) => ({
  ...shown({
    idText: id,
    vaultIdText: "buero",
    role: "edit",
    version: 1,
    content: {
      type: "login",
      title: id,
      fields: [{ id: "password", name: "", value: password, kind: "secret" }],
      tags: [],
      favorite: false,
      history: [],
    },
  }),
  ...(sharedBy ? { sharedBy } : {}),
});
const entries = markToChange([
  login("Mail", "sommer2019"),
  login("Bank", "Kessel-Pumpe-Rohr-7!"),
  login("Geteilt", "Hallo123", "Anna"),
]);

const service = (answer?: FetchRange) => {
  const asked: string[] = [];
  const fetchRange: FetchRange = async (prefix) => {
    asked.push(prefix);
    if (answer) return answer(prefix);
    const leaked = ["sommer2019", "Hallo123"].filter((p) => sha1(p).startsWith(prefix));
    const lines = leaked.map((p) => `${sha1(p).slice(5)}:412`);
    return { ok: true, value: [...lines, `${"0".repeat(35)}:0`].join("\r\n") };
  };
  return { asked, leaks: createRoot(() => createLeaks(createLeakCheck(fetchRange))) };
};

const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flush();
};

describe("createLeaks", () => {
  it("asks nothing and stays off while the check is off", async () => {
    const { asked, leaks } = service();
    await leaks.refresh(entries, false);
    await settle();
    expect(leaks.state()).toEqual({ kind: "off" });
    expect(asked).toEqual([]);
  });

  it("finds the leaked password of an own entry, never asks for a shared one's", async () => {
    const { asked, leaks } = service();
    await leaks.refresh(entries, true);
    await settle();
    expect(leaks.state()).toEqual({ kind: "done", leaked: new Map([["Mail", 412]]) });
    expect(asked.sort()).toEqual(
      [sha1("Kessel-Pumpe-Rohr-7!"), sha1("sommer2019")].map((h) => h.slice(0, 5)).sort(),
    );
  });

  it("says why a check failed", async () => {
    const { leaks } = service(async () => ({ ok: false, error: "unavailable" }));
    await leaks.refresh(entries, true);
    await settle();
    expect(leaks.state()).toEqual({ kind: "failed", error: "unavailable" });
  });

  it("goes back to off when the check is switched off, and a newer run wins", async () => {
    const { leaks } = service();
    const first = leaks.refresh(entries, true);
    const second = leaks.refresh(entries, false);
    await Promise.all([first, second]);
    await settle();
    expect(leaks.state()).toEqual({ kind: "off" });
  });
});
