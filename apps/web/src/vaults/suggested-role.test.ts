import { describe, expect, it } from "vitest";
import { suggestedRole } from "./vault-requests.tsx";

// K-305 part 5: the server suggests a group's role; it never makes a grant start at "manage"
describe("suggestedRole", () => {
  it("takes read and edit from the linked groups, nothing higher, read without a group", () => {
    expect(suggestedRole(null)).toBe("read");
    expect(suggestedRole("read")).toBe("read");
    expect(suggestedRole("edit")).toBe("edit");
    expect(suggestedRole("manage")).toBe("read");
  });
});
