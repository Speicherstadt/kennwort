import { describe, expect, it } from "vitest";
import { ENTRY_TYPES, TEMPLATES, typeChoices, typeLabel } from "./entry-types.ts";

// K-406: a passkey is a type of its own that only a website creates
describe("passkey entries", () => {
  it("are not offered for a new entry, but keep their type when edited", () => {
    expect(ENTRY_TYPES).not.toContain("passkey");
    expect(typeChoices("login")).toBe(ENTRY_TYPES);
    expect(typeChoices("passkey")).toEqual([...ENTRY_TYPES, "passkey"]);
  });

  it("show the fields of F-12, only the private key as a secret", () => {
    expect(TEMPLATES.passkey.map((f) => [f.id, f.kind])).toEqual([
      ["rp-id", "text"],
      ["username", "text"],
      ["display-name", "text"],
      ["user-handle", "text"],
      ["credential-id", "text"],
      ["private-key", "secret"],
      ["counter", "text"],
    ]);
    expect(typeLabel("passkey")).toBe("Passkey");
  });
});
