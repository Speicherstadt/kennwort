import { describe, expect, it } from "vitest";
import { type CaptureDeps, createCaptures, KEEP_MS, OFFER_MS } from "./captures.ts";
import type { Capture } from "./messages.ts";

// K-404: a submitted login lives only in the worker's memory, is offered once, handed over once
// and forgotten soon
const LOGIN: Capture = {
  host: "portal.weber-haustechnik.test",
  url: "https://portal.weber-haustechnik.test/login",
  username: "jonas.weber",
  password: "Kupfer-Rohr-18!",
};

const setup = () => {
  let clock = 1_000;
  const timers: { run: () => void; at: number }[] = [];
  const deps: CaptureDeps = {
    now: () => clock,
    schedule: (run, ms) => timers.push({ run, at: clock + ms }),
  };
  const advance = (ms: number) => {
    clock += ms;
    for (const timer of timers.filter((t) => t.at <= clock)) timer.run();
  };
  return { captures: createCaptures(deps), advance };
};

describe("the held logins", () => {
  it("offers a login once and hands it over once", () => {
    const { captures } = setup();
    expect(captures.take(3)).toBeUndefined();
    captures.put(3, LOGIN);
    // Not offered yet: nobody may take it
    expect(captures.take(3)).toBeUndefined();
    expect(captures.offer(3)).toBe(true);
    expect(captures.offer(3)).toBe(false);
    expect(captures.take(3)).toEqual(LOGIN);
    expect(captures.take(3)).toBeUndefined();
  });

  it("keeps one login per tab, the newest", () => {
    const { captures } = setup();
    captures.put(3, LOGIN);
    captures.put(3, { ...LOGIN, password: "neuer" });
    captures.put(4, { ...LOGIN, username: "anna" });
    expect(captures.offer(3)).toBe(true);
    expect(captures.take(3)?.password).toBe("neuer");
    expect(captures.offer(4)).toBe(true);
    expect(captures.take(4)?.username).toBe("anna");
  });

  it("offers nothing after OFFER_MS and forgets everything after KEEP_MS", () => {
    const { captures, advance } = setup();
    captures.put(3, LOGIN);
    advance(OFFER_MS + 1);
    expect(captures.offer(3)).toBe(false);

    captures.put(5, LOGIN);
    advance(OFFER_MS);
    expect(captures.offer(5)).toBe(true);
    advance(KEEP_MS - OFFER_MS);
    expect(captures.take(5)).toBeUndefined();
  });

  it("forgets an untaken login when its timer runs, even if nobody asks", () => {
    const { captures, advance } = setup();
    captures.put(3, LOGIN);
    expect(captures.offer(3)).toBe(true);
    advance(KEEP_MS);
    // A newer login of the tab is not dropped by the older one's timer
    captures.put(3, LOGIN);
    advance(1);
    expect(captures.offer(3)).toBe(true);
    expect(captures.take(3)).toEqual(LOGIN);
  });

  it("forgets a closed tab's login", () => {
    const { captures } = setup();
    captures.put(3, LOGIN);
    captures.drop(3);
    expect(captures.offer(3)).toBe(false);
  });
});
