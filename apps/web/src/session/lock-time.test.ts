import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { derive, fakeApi, memory, PASSPHRASE } from "./session.test-kit.ts";
import { createSession } from "./session.ts";

const MINUTE = 60_000;

/** A clock the test moves by hand; timers fire once their time has come */
const fakeClock = () => {
  let time = 0;
  let next = 0;
  const pending = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => time,
    schedule: (run: () => void, ms: number) => {
      next += 1;
      pending.set(next, { at: time + ms, run });
      return next;
    },
    cancel: (timer: unknown) => {
      pending.delete(timer as number);
    },
    advance: (ms: number) => {
      time += ms;
      for (const [id, { at, run }] of [...pending])
        if (at <= time) {
          pending.delete(id);
          run();
        }
    },
  };
};

const openSession = async () => {
  const clock = fakeClock();
  const session = createSession({ api: fakeApi(), storage: memory(), derive, ...clock });
  await session.setUp("richtiger-code", PASSPHRASE);
  flush();
  return { clock, session };
};

// The company policy arrives a moment after unlocking (ApplyPolicy): its lock time counts from the
// last use, so a slow answer from the server does not keep an idle account open longer (P-03)
describe("a new lock time", () => {
  it("counts from the last use, not from when it arrives", async () => {
    const { clock, session } = await openSession();
    clock.advance(9 * MINUTE);
    session.touch();
    clock.advance(9 * MINUTE);
    session.setLockAfter(10 * MINUTE);
    clock.advance(MINUTE + 1);
    flush();
    expect(session.opened()).toBeUndefined();
  });

  it("locks at once when the account has been idle longer than the new time", async () => {
    const { clock, session } = await openSession();
    clock.advance(6 * MINUTE);
    session.setLockAfter(5 * MINUTE);
    clock.advance(0);
    flush();
    expect(session.opened()).toBeUndefined();
  });

  it("keeps an account open that was used within the new time", async () => {
    const { clock, session } = await openSession();
    clock.advance(4 * MINUTE);
    session.touch();
    session.setLockAfter(5 * MINUTE);
    clock.advance(5 * MINUTE - 1);
    flush();
    expect(session.opened()).toBeDefined();
    clock.advance(1);
    flush();
    expect(session.opened()).toBeUndefined();
  });

  // Date.now follows the wall clock, which can be set back (NTP, a changed time zone setting, a
  // user): a last use "in the future" must not stretch the lock time beyond its length
  it("never waits longer than the lock time when the clock went back", async () => {
    const { clock, session } = await openSession();
    clock.advance(MINUTE);
    session.touch();
    clock.advance(-60 * MINUTE);
    session.setLockAfter(5 * MINUTE);
    flush();
    expect(session.opened()).toBeDefined();
    clock.advance(5 * MINUTE);
    flush();
    expect(session.opened()).toBeUndefined();
  });
});
