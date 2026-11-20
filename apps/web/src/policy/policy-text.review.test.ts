import { m, setLocale } from "@kennwort/ui";
import { describe, expect, it } from "vitest";

// Review of K-304 part 4: the lock time the company set, as members read it, for one minute too
describe("policy_lock_after (review)", () => {
  it("says one minute in the singular, in German and in English", () => {
    setLocale("de", { reload: false });
    expect(m.policy_lock_after({ minutes: 1 })).toBe(
      "Kennwort sperrt sich nach 1 Minute ohne Nutzung.",
    );
    setLocale("en", { reload: false });
    expect(m.policy_lock_after({ minutes: 1 })).toBe("Kennwort locks after 1 minute without use.");
  });
});
