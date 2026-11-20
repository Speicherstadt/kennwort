// Regression (review of K-203): Better Auth's own rate limit (better-auth.ts, rateLimit max 30 per 60 s) keys on the
// client-supplied X-Forwarded-For (its default ipAddressHeaders), not on the socket address that
// main.ts now hands to the app. A client escapes it by rotating the header, and clients without the
// header all share one bucket (Better Auth's "no-trusted-ip" key in production, localhost in tests),
// so one client can lock everyone else out of passkey sign-in.
import { describe, expect, it } from "vitest";
import { signInSetup } from "../testing/sign-in-setup.ts";

const PATH = "/auth/passkey/generate-authenticate-options";

describe("Better Auth rate limit", () => {
  it("is not escaped by a client-chosen X-Forwarded-For or address header", async () => {
    const setup = await signInSetup();
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++)
      statuses.push(
        (
          await setup.request(PATH, {
            method: "GET",
            ip: "203.0.113.7",
            headers: {
              "x-forwarded-for": `198.51.100.${i}`,
              "x-kennwort-client": `198.51.100.${i}`,
            },
          })
        ).status,
      );
    expect(statuses).toContain(429);
  });

  it("counts each socket address on its own: one client does not lock out another", async () => {
    const setup = await signInSetup();
    for (let i = 0; i < 40; i++) await setup.request(PATH, { method: "GET", ip: "203.0.113.7" });
    expect((await setup.request(PATH, { method: "GET", ip: "203.0.113.8" })).status).toBe(200);
  });
});
