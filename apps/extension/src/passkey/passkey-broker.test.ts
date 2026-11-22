import { describe, expect, it, vi } from "vitest";
import type { Sender } from "../fill/broker.ts";
import type { FrameInfo } from "../fill/frames.ts";
import { createPasskeyBroker, DEFAULT_TIMEOUT_MS, TAKE_MS } from "./passkey-broker.ts";

// K-406: the worker takes a ceremony only from a frame it may serve, with the origin of the frame
// tree and an rpId the page may use, and answers the page only with what the prompt answered
const ID = "abcdefghijklmnopabcdefghijklmnop";
const PORTAL = "https://portal.weber-haustechnik.test/login";
const topFrame: FrameInfo = { frameId: 0, parentFrameId: -1, url: PORTAL, documentId: "doc-top" };
const sameOrigin: FrameInfo = {
  frameId: 4,
  parentFrameId: 0,
  url: "https://portal.weber-haustechnik.test/inner",
  documentId: "doc-inner",
};
const foreign: FrameInfo = {
  frameId: 5,
  parentFrameId: 0,
  url: "https://ads.test/",
  documentId: "doc-ad",
};

const create = (extra: Record<string, unknown> = {}) => ({
  type: "passkey-create",
  options: {
    rp: { name: "Weber Portal", ...extra },
    user: { id: "AQID", name: "jonas.weber", displayName: "Jonas Weber" },
    challenge: "q83vEjRWeJA",
    algorithms: [-8, -7],
    exclude: [],
    userVerification: "required",
  },
});
const get = (options: Record<string, unknown> = {}) => ({
  type: "passkey-get",
  options: { challenge: "q83vEjRWeJA", allow: ["AAEC"], userVerification: "preferred", ...options },
});

const setup = (opts: { frames?: FrameInfo[]; opens?: boolean } = {}) => {
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const deps = {
    extensionId: ID,
    frames: vi.fn(async (_tab: number) => opts.frames ?? [topFrame, sameOrigin, foreign]),
    send: vi.fn(async () => ({ ok: opts.opens ?? true }) as unknown),
    schedule: vi.fn((run: () => void, ms: number) => {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return timer;
    }),
    cancel: vi.fn((timer: unknown) => {
      (timer as { cancelled: boolean }).cancelled = true;
    }),
  };
  return { deps, timers, broker: createPasskeyBroker(deps) };
};

type Loose = { [K in keyof Sender]?: Sender[K] | undefined };
const content = (frame: FrameInfo, extra: Loose = {}): Sender =>
  ({
    id: ID,
    url: frame.url,
    frameId: frame.frameId,
    documentId: frame.documentId,
    tab: { id: 3 },
    ...extra,
  }) as Sender;

/** Lets the broker's awaits run */
const settled = () => new Promise((done) => setTimeout(done, 0));

describe("the passkey broker", () => {
  it("holds a registration from the top frame and answers what the prompt answered", async () => {
    const { broker, deps, timers } = setup();
    const answer = broker(create({ id: "weber-haustechnik.test" }), content(topFrame));
    await settled();
    expect(deps.send).toHaveBeenCalledWith(
      3,
      { type: "kennwort-passkey-open" },
      {
        frameId: 0,
        documentId: "doc-top",
        url: PORTAL,
      },
    );
    expect(timers.map((t) => t.ms)).toEqual([TAKE_MS, DEFAULT_TIMEOUT_MS]);
    expect(broker.take(3)).toEqual({
      kind: "create",
      origin: "https://portal.weber-haustechnik.test",
      rpId: "weber-haustechnik.test",
      rpName: "Weber Portal",
      user: { id: "AQID", name: "jonas.weber", displayName: "Jonas Weber" },
      challenge: "q83vEjRWeJA",
      algorithms: [-8, -7],
      exclude: [],
    });
    // Handed over once
    expect(broker.take(3)).toBeUndefined();
    expect(broker.finish(3, { outcome: "fallback" })).toBe(true);
    expect(await answer).toEqual({ outcome: "fallback" });
    expect(timers.every((t) => t.cancelled)).toBe(true);
    expect(broker.finish(3, { outcome: "fallback" })).toBe(false);
  });

  it("serves a same-origin child frame with its own origin and host as rpId", async () => {
    const { broker } = setup();
    const answer = broker(get(), content(sameOrigin));
    await settled();
    expect(broker.take(3)).toEqual({
      kind: "get",
      origin: "https://portal.weber-haustechnik.test",
      rpId: "portal.weber-haustechnik.test",
      challenge: "q83vEjRWeJA",
      allow: ["AAEC"],
      userVerification: "preferred",
    });
    broker.finish(3, { outcome: "error", name: "NotAllowedError" });
    expect(await answer).toEqual({ outcome: "error", name: "NotAllowedError" });
  });

  it("leaves a cross-origin frame to the browser and opens no prompt", async () => {
    const { broker, deps } = setup();
    expect(await broker(get(), content(foreign))).toEqual({ outcome: "fallback" });
    expect(await broker(get(), content(topFrame, { frameId: 77 }))).toEqual({
      outcome: "fallback",
    });
    expect(deps.send).not.toHaveBeenCalled();
  });

  // A sandboxed document (iframe sandbox, or CSP sandbox on the page itself, as sites serve
  // uploads) has an opaque origin, while the frame tree shows only its address: the browser
  // refuses WebAuthn there, so the frame's address must not stand in for its origin
  it("leaves a document with an opaque or another origin to the browser and opens no prompt", async () => {
    const { broker, deps } = setup();
    expect(await broker(get(), content(topFrame, { origin: "null" }))).toEqual({
      outcome: "fallback",
    });
    expect(await broker(get(), content(sameOrigin, { origin: "https://ads.test" }))).toEqual({
      outcome: "fallback",
    });
    expect(deps.send).not.toHaveBeenCalled();
    expect(broker.take(3)).toBeUndefined();
    // The sender's own origin, where the browser names it, serves as before
    void broker(get(), content(topFrame, { origin: "https://portal.weber-haustechnik.test" }));
    await settled();
    expect(broker.take(3)?.origin).toBe("https://portal.weber-haustechnik.test");
  });

  it("refuses an rpId of another site with SecurityError, before any prompt", async () => {
    const { broker, deps } = setup();
    for (const message of [
      create({ id: "weber-haustechnik-portal.test" }),
      get({ rpId: "evil.test" }),
      get({ rpId: "test" }),
    ])
      expect(await broker(message, content(topFrame))).toEqual({
        outcome: "error",
        name: "SecurityError",
      });
    expect(deps.send).not.toHaveBeenCalled();
    expect(broker.take(3)).toBeUndefined();
  });

  it("leaves pages that are not secure, other algorithms and a missing top frame to the browser", async () => {
    const http = { ...topFrame, url: "http://portal.weber-haustechnik.test/" };
    expect(await setup({ frames: [http] }).broker(get(), content(http))).toEqual({
      outcome: "fallback",
    });
    const rsaOnly = create();
    rsaOnly.options.algorithms = [-257];
    expect(await setup().broker(rsaOnly, content(topFrame))).toEqual({ outcome: "fallback" });
    const anyAlgorithm = create();
    anyAlgorithm.options.algorithms = [];
    const { broker } = setup();
    void broker(anyAlgorithm, content(topFrame));
    await settled();
    expect(broker.take(3)?.kind).toBe("create");
    expect(await setup({ opens: false }).broker(get(), content(topFrame))).toEqual({
      outcome: "fallback",
    });
    const failing = setup();
    failing.deps.send.mockRejectedValueOnce(new Error("no receiver"));
    expect(await failing.broker(get(), content(topFrame))).toEqual({ outcome: "fallback" });
    const childOnly = setup({ frames: [sameOrigin] });
    expect(await childOnly.broker(get(), content(sameOrigin))).toEqual({ outcome: "fallback" });
    const broken = setup();
    broken.deps.frames.mockRejectedValueOnce(new Error("gone"));
    expect(await broken.broker(get(), content(topFrame))).toEqual({ outcome: "fallback" });
  });

  it("answers no page, extension page or navigated document", async () => {
    const { broker } = setup();
    const notAllowed = { outcome: "error", name: "NotAllowedError" };
    expect(await broker(get(), content(topFrame, { id: "other" }))).toEqual(notAllowed);
    expect(
      await broker(get(), { id: ID, url: "chrome-extension://x/", frameId: 0, tab: { id: 3 } }),
    ).toEqual(notAllowed);
    expect(await broker(get(), content(topFrame, { documentId: "doc-old" }))).toEqual(notAllowed);
    expect(
      await broker({ type: "passkey-get", options: { challenge: "" } }, content(topFrame)),
    ).toBeUndefined();
    expect(await broker({ type: "save-pending" }, content(topFrame))).toBeUndefined();
  });

  it("falls back when no prompt takes the ceremony in time, and ends it at the page's timeout", async () => {
    const { broker, timers } = setup();
    const untaken = broker(get(), content(topFrame));
    await settled();
    timers[0]?.run();
    expect(await untaken).toEqual({ outcome: "fallback" });

    const timed = setup();
    const message = get({ timeout: 60_000 });
    const answer = timed.broker(message, content(topFrame));
    await settled();
    expect(timed.timers[1]?.ms).toBe(60_000);
    timed.broker.take(3);
    // Taken: the take timer does nothing any more
    timed.timers[0]?.run();
    timed.timers[1]?.run();
    expect(await answer).toEqual({ outcome: "error", name: "NotAllowedError" });
    expect(timed.broker.finish(3, { outcome: "fallback" })).toBe(false);
  });

  it("keeps one ceremony per tab: a newer one ends the older, whose timers then do nothing", async () => {
    const { broker, timers } = setup();
    const first = broker(get(), content(topFrame));
    await settled();
    const second = broker(create(), content(topFrame));
    await settled();
    expect(await first).toEqual({ outcome: "error", name: "NotAllowedError" });
    timers[0]?.run();
    timers[1]?.run();
    expect(broker.take(3)?.kind).toBe("create");
    broker.drop(3);
    expect(await second).toEqual({ outcome: "error", name: "NotAllowedError" });
  });

  it("does not finish a ceremony the prompt has not taken", async () => {
    const { broker } = setup();
    void broker(get(), content(topFrame));
    await settled();
    expect(broker.finish(3, { outcome: "fallback" })).toBe(false);
    expect(broker.finish(4, { outcome: "fallback" })).toBe(false);
  });

  it("ends a ceremony its own frame aborts, not one another frame aborts", async () => {
    const { broker } = setup();
    const answer = broker(get(), content(topFrame));
    await settled();
    expect(await broker({ type: "passkey-abort" }, content(sameOrigin))).toEqual({
      outcome: "error",
      name: "NotAllowedError",
    });
    expect(broker.take(3)).toBeDefined();
    await broker({ type: "passkey-abort" }, content(topFrame, { id: "other" }));
    expect(broker.finish(3, { outcome: "fallback" })).toBe(true);
    expect(await answer).toEqual({ outcome: "fallback" });

    const aborted = setup();
    const gone = aborted.broker(get(), content(topFrame));
    await settled();
    await aborted.broker({ type: "passkey-abort" }, content(topFrame));
    expect(await gone).toEqual({ outcome: "error", name: "NotAllowedError" });
  });
});
