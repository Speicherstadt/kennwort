// Finding (same root as audit-malformed-subject): POST /api/audit accepts a subject that is not
// well-formed text, and recordAudit's encode throws inside the route: a 500 instead of a 400.
import { describe, expect, it } from "bun:test";
import { signInSetup } from "../testing/sign-in-setup.ts";

describe("POST /api/audit with ill-formed text", () => {
  it("rejects a lone surrogate as invalid", async () => {
    const setup = await signInSetup();
    const jonas = await setup.member("weber", "owner");
    const response = await setup.request("/api/audit", {
      token: jonas.token,
      body: { action: "recovery", subject: "\ud800", signature: "A".repeat(87) },
    });
    expect(response.status).toBe(400);
  });
});
