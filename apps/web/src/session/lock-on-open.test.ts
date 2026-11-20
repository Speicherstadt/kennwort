import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { derive, fakeApi, memory, PASSPHRASE } from "./session.test-kit.ts";
import { createSession } from "./session.ts";

// Review of K-304 part 4: the automatic lock runs from the moment an account opens, not only from
// the first key press after it (P-03)
describe("the automatic lock right after opening", () => {
  it("locks after the time even if nobody touches the app after setup", async () => {
    const pending: (() => void)[] = [];
    const session = createSession({
      api: fakeApi(),
      storage: memory(),
      derive,
      schedule: (run) => pending.push(run),
      cancel: () => {},
    });
    await session.setUp("richtiger-code", PASSPHRASE);
    flush();
    expect(session.opened()).toBeDefined();
    for (const run of pending.splice(0)) run();
    flush();
    expect(session.opened()).toBeUndefined();
  });
});
