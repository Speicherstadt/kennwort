import { describe, expect, it, vi } from "vitest";
import type { Warning } from "../alert/messages.ts";
import type { Sender } from "../fill/broker.ts";
import type { FillTarget, FrameInfo } from "../fill/frames.ts";
import { createCaptures } from "./captures.ts";
import type { PromptContentMessage } from "./messages.ts";
import { createSaveBroker, type SaveBrokerDeps } from "./save-broker.ts";

// K-404: the worker takes a submitted login only from a content script in a frame it may fill,
// reads the host from the frame tree, offers it once to the tab's top frame and hands it once to
// the prompt that top frame opened
const ID = "abcdefghijklmnopabcdefghijklmnop";
const NONCE = "0123456789abcdef0123456789abcdef";
const PORTAL = "https://portal.weber-haustechnik.test/login";
const WIDGET = "https://sparkasse.test/widget";
const PROMPT_URL = `chrome-extension://${ID}/src/prompt/prompt.html#${NONCE}`;

const topFrame: FrameInfo = { frameId: 0, parentFrameId: -1, url: PORTAL, documentId: "doc-top" };
const sameOrigin: FrameInfo = {
  frameId: 4,
  parentFrameId: 0,
  url: "https://portal.weber-haustechnik.test/inner",
  documentId: "doc-inner",
};
const foreign: FrameInfo = { frameId: 5, parentFrameId: 0, url: WIDGET, documentId: "doc-w" };

const setup = (frames: FrameInfo[] = [topFrame, sameOrigin, foreign], owns = true) => {
  const deps = {
    extensionId: ID,
    promptPath: "/src/prompt/prompt.html",
    captures: createCaptures({ now: () => 0, schedule: () => undefined }),
    warnings: createCaptures<Warning>({ now: () => 0, schedule: () => undefined }),
    frames: vi.fn(async (_tab: number) => frames),
    send: vi.fn(
      async (_tab: number, message: PromptContentMessage, target: FillTarget): Promise<unknown> => {
        if (message.type === "kennwort-prompt-owns")
          return { ok: owns && target.frameId === 0 && message.nonce === NONCE };
        return { ok: true };
      },
    ),
    openPopup: vi.fn(async () => {}),
  } satisfies SaveBrokerDeps;
  const delivered = () =>
    deps.send.mock.calls.filter(([, message]) => message.type !== "kennwort-prompt-owns");
  return { deps, delivered, broker: createSaveBroker(deps) };
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
const prompt: Sender = { id: ID, url: PROMPT_URL, frameId: 9, tab: { id: 3 } };
const submit = {
  type: "save-capture",
  username: "jonas.weber",
  password: "Kupfer-Rohr-18!",
  previous: "Kupfer-Rohr-17!",
};

describe("the save broker", () => {
  it("holds a login from the top frame, with the host of the frame tree, and hands it over once", async () => {
    const { broker } = setup();
    expect(await broker(submit, content(topFrame))).toEqual({ ok: true });
    expect(await broker({ type: "save-pending" }, content(topFrame))).toEqual({ ok: true });
    expect(await broker({ type: "prompt-take", nonce: NONCE }, prompt)).toEqual({
      ok: true,
      capture: {
        username: "jonas.weber",
        password: "Kupfer-Rohr-18!",
        previous: "Kupfer-Rohr-17!",
        host: "portal.weber-haustechnik.test",
        url: PORTAL,
      },
    });
    expect(await broker({ type: "prompt-take", nonce: NONCE }, prompt)).toEqual({
      ok: false,
      error: "nothing",
    });
  });

  it("takes a login from a frame of the same origin as the top frame", async () => {
    const { broker, deps } = setup();
    expect(await broker(submit, content(sameOrigin))).toEqual({ ok: true });
    expect(deps.captures.offer(3)).toBe(true);
    expect(deps.captures.take(3)?.url).toBe(sameOrigin.url);
  });

  it("refuses a login from a foreign frame, an unknown frame or a navigated document", async () => {
    const { broker, deps } = setup();
    expect(await broker(submit, content(foreign))).toEqual({ ok: false, error: "foreign-frame" });
    expect(await broker(submit, content(topFrame, { frameId: 42 }))).toEqual({
      ok: false,
      error: "unknown-frame",
    });
    expect(await broker(submit, content(topFrame, { documentId: "doc-old" }))).toEqual({
      ok: false,
      error: "unknown-frame",
    });
    expect(deps.captures.offer(3)).toBe(false);
  });

  it("reads the host from the frame tree, not from what the sender claims", async () => {
    const { broker, deps } = setup([{ ...topFrame, url: "https://other.test/x" }]);
    expect(await broker(submit, content(topFrame))).toEqual({ ok: true });
    deps.captures.offer(3);
    expect(deps.captures.take(3)?.host).toBe("other.test");
  });

  it("refuses a page that names no site", async () => {
    const { broker } = setup([{ ...topFrame, url: "https://co.uk/" }]);
    expect(await broker(submit, content(topFrame, { url: "https://co.uk/" }))).toEqual({
      ok: false,
      error: "no-page",
    });
  });

  it("answers only content scripts of web frames in a tab", async () => {
    const { broker } = setup();
    for (const sender of [
      content(topFrame, { id: "other-extension" }),
      content(topFrame, { tab: undefined }),
      content(topFrame, { url: `chrome-extension://${ID}/popup.html` }),
      content(topFrame, { url: undefined }),
      content(topFrame, { frameId: undefined }),
    ])
      expect(await broker(submit, sender)).toEqual({ ok: false, error: "not-content" });
  });

  it("offers a login only to the top frame, and only once", async () => {
    const { broker } = setup();
    await broker(submit, content(topFrame));
    expect(await broker({ type: "save-pending" }, content(sameOrigin))).toEqual({
      ok: false,
      error: "not-top",
    });
    expect(await broker({ type: "save-pending" }, content(topFrame))).toEqual({ ok: true });
    expect(await broker({ type: "save-pending" }, content(topFrame))).toEqual({
      ok: false,
      error: "nothing",
    });
  });

  it("answers only the extension's prompt page whose nonce the top frame confirms", async () => {
    const { broker, deps } = setup();
    await broker(submit, content(topFrame));
    await broker({ type: "save-pending" }, content(topFrame));
    const take = { type: "prompt-take", nonce: NONCE };
    for (const sender of [
      { ...prompt, url: `chrome-extension://${ID}/src/menu/menu.html#${NONCE}` },
      { ...prompt, frameId: 0 },
      { ...prompt, id: "other" },
      content(topFrame),
    ])
      expect(await broker(take, sender)).toEqual({ ok: false, error: "not-prompt" });
    expect(await broker({ type: "prompt-take", nonce: "ab".repeat(16) }, prompt)).toEqual({
      ok: false,
      error: "unknown-frame",
    });
    // Still there for the right prompt
    expect(deps.captures.take(3)).toBeDefined();
  });

  it("refuses a prompt when the top frame does not confirm it or is no web page", async () => {
    const take = { type: "prompt-take", nonce: NONCE };
    expect(await setup(undefined, false).broker(take, prompt)).toEqual({
      ok: false,
      error: "unknown-frame",
    });
    expect(await setup([{ ...topFrame, url: "about:blank" }]).broker(take, prompt)).toEqual({
      ok: false,
      error: "unknown-frame",
    });
    expect(await setup([]).broker(take, prompt)).toEqual({ ok: false, error: "unknown-frame" });
  });

  it("passes show, size, close and the check on to the top frame's document", async () => {
    const { broker, delivered, deps } = setup();
    const target = { frameId: 0, documentId: "doc-top", url: PORTAL };
    expect(await broker({ type: "prompt-show", nonce: NONCE }, prompt)).toEqual({ ok: true });
    expect(await broker({ type: "prompt-size", nonce: NONCE, height: 140 }, prompt)).toEqual({
      ok: true,
    });
    expect(await broker({ type: "prompt-check", nonce: NONCE }, prompt)).toEqual({ ok: true });
    expect(await broker({ type: "prompt-pin", nonce: NONCE }, prompt)).toEqual({ ok: true });
    expect(await broker({ type: "prompt-close", nonce: NONCE }, prompt)).toEqual({ ok: true });
    expect(delivered()).toEqual([
      [3, { type: "kennwort-prompt-show", nonce: NONCE }, target],
      [3, { type: "kennwort-prompt-size", nonce: NONCE, height: 140 }, target],
      [3, { type: "kennwort-prompt-check", nonce: NONCE }, target],
      [3, { type: "kennwort-prompt-pin", nonce: NONCE }, target],
      [3, { type: "kennwort-prompt-close", nonce: NONCE }, target],
    ]);
    expect(await broker({ type: "prompt-unlock", nonce: NONCE }, prompt)).toEqual({ ok: true });
    expect(deps.openPopup).toHaveBeenCalledOnce();
  });

  it("says the prompt is hidden when the content script does not find it clear", async () => {
    const { broker, deps } = setup();
    deps.send.mockImplementation(async (_tab, message) =>
      message.type === "kennwort-prompt-owns" ? { ok: true } : { ok: false },
    );
    expect(await broker({ type: "prompt-check", nonce: NONCE }, prompt)).toEqual({
      ok: false,
      error: "prompt-hidden",
    });
    deps.send.mockImplementation(async (_tab, message) => {
      if (message.type === "kennwort-prompt-owns") return { ok: true };
      throw new Error("gone");
    });
    expect(await broker({ type: "prompt-check", nonce: NONCE }, prompt)).toEqual({
      ok: false,
      error: "prompt-hidden",
    });
  });

  // K-405: a phishing warning goes through the same prompt, before a login to save
  it("offers a pending warning on load and hands it to the prompt before any login", async () => {
    const { broker, deps } = setup();
    const warning = {
      host: "portal-weber.test",
      url: "https://portal-weber.test/",
      entries: ["e1"],
    };
    await broker(submit, content(topFrame));
    deps.warnings.put(3, warning);
    expect(await broker({ type: "save-pending" }, content(topFrame))).toEqual({ ok: true });
    expect(await broker({ type: "prompt-take", nonce: NONCE }, prompt)).toEqual({
      ok: true,
      warning,
    });
    // The login of the page that raised the warning is not offered after it
    expect(await broker({ type: "prompt-take", nonce: NONCE }, prompt)).toEqual({
      ok: false,
      error: "nothing",
    });

    const alone = setup();
    alone.deps.warnings.put(3, warning);
    expect(await alone.broker({ type: "save-pending" }, content(topFrame))).toEqual({ ok: true });
    expect(await alone.broker({ type: "prompt-take", nonce: NONCE }, prompt)).toEqual({
      ok: true,
      warning,
    });
  });

  it("answers nothing that is not about saving, and survives a failing frame tree", async () => {
    const { broker, deps } = setup();
    expect(await broker({ type: "menu-page", nonce: NONCE }, prompt)).toBeUndefined();
    deps.frames.mockRejectedValue(new Error("no tab"));
    expect(await broker(submit, content(topFrame))).toEqual({ ok: false, error: "unknown-frame" });
  });

  // K-406: a passkey ceremony goes to the prompt before a warning or a login, and its answer back
  it("hands the prompt a passkey ceremony first and passes its answer to the passkey broker", async () => {
    const { deps, broker } = setup();
    const ceremony = {
      kind: "get" as const,
      origin: "https://portal.weber-haustechnik.test",
      rpId: "portal.weber-haustechnik.test",
      challenge: "q83v",
      allow: [],
      userVerification: "preferred" as const,
    };
    const passkeys = { take: vi.fn(() => ceremony), finish: vi.fn(() => true) };
    const withPasskeys = createSaveBroker({ ...deps, passkeys });
    expect(await withPasskeys({ type: "prompt-take", nonce: NONCE }, prompt)).toEqual({
      ok: true,
      ceremony,
    });
    expect(passkeys.take).toHaveBeenCalledWith(3);
    const answer = { type: "prompt-passkey", nonce: NONCE, answer: { outcome: "fallback" } };
    expect(await withPasskeys(answer, prompt)).toEqual({ ok: true });
    expect(passkeys.finish).toHaveBeenCalledWith(3, { outcome: "fallback" });
    passkeys.finish.mockReturnValue(false);
    expect(await withPasskeys(answer, prompt)).toEqual({ ok: false, error: "nothing" });
    // Only the prompt answers, with an answer of the right shape, and without passkeys nothing
    expect(await withPasskeys(answer, content(topFrame))).toEqual({
      ok: false,
      error: "not-prompt",
    });
    expect(await withPasskeys({ ...answer, answer: { outcome: "x" } }, prompt)).toBeUndefined();
    expect(await broker(answer, prompt)).toEqual({ ok: false, error: "nothing" });
  });
});
