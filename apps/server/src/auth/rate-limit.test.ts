// Regression (review of K-203): the rate limit keys on the client-supplied X-Forwarded-For header (login-key.ts
// clientKey), so a client that changes the header per request is never limited
import { describe, expect, it } from "vitest";
import { signInSetup } from "../testing/sign-in-setup.ts";

describe("rate limit", () => {
  it("cannot be escaped by sending a different X-Forwarded-For on every request", async () => {
    const setup = await signInSetup({ rateLimit: 2 });
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++)
      statuses.push(
        (
          await setup.request("/auth/login-key/challenge", {
            body: { accountId: "x" },
            headers: { "x-forwarded-for": `198.51.100.${i}` },
          })
        ).status,
      );
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
  });

  it("behind a proxy counts the address the proxy appended, not what the client sent before it", async () => {
    const setup = await signInSetup({ rateLimit: 2, behindProxy: true });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++)
      statuses.push(
        (
          await setup.request("/auth/login-key/challenge", {
            body: { accountId: "x" },
            headers: { "x-forwarded-for": `198.51.100.${i}, 203.0.113.9` },
          })
        ).status,
      );
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it("limits accepting invitations as well", async () => {
    const setup = await signInSetup({ rateLimit: 2 });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++)
      statuses.push((await setup.request("/auth/invitations/x/accept", { body: {} })).status);
    expect(statuses).toEqual([400, 400, 429]);
  });
});
