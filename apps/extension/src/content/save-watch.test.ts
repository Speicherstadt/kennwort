import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureRequest, SaveAnswer } from "../save/messages.ts";
import type { PromptFrame } from "./prompt-frame.ts";
import { ACTION_MS, createSaveWatch, type SaveWatchDeps, WATCH_MS } from "./save-watch.ts";

// K-404: the content script hands a login to the worker only after a submit the user made, from
// fields the page shows, in a frame it may fill; it opens the prompt only when the worker offers one
const ID = "abcdefghijklmnopabcdefghijklmnop";
const NONCE = "ab".repeat(16);
const WORKER = { id: ID };

const fakeFrame = () =>
  ({
    open: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    place: vi.fn(),
    resize: vi.fn(),
    isOpen: vi.fn(() => true),
    isClear: vi.fn(() => true),
    pin: vi.fn(),
  }) satisfies PromptFrame;

/** An event as the browser would deliver it; happy-dom's own are never trusted */
const event = <T extends Event>(target: EventTarget, extra: object = {}, isTrusted = true) =>
  ({ isTrusted, target, composedPath: () => [target], ...extra }) as unknown as T;

const setup = (overrides: Partial<SaveWatchDeps> = {}, pending: SaveAnswer = { ok: true }) => {
  document.body.innerHTML = `<form id="login"><input id="user" value="jonas.weber">
    <input id="pass" type="password" value="Kupfer-Rohr-17!"><button id="go" type="button">Anmelden</button>
    </form><div id="formless"><input id="fuser" value="anna"><input id="fpass" type="password"
    value="Ventil-9!"><button id="fgo">Weiter</button></div><button id="before">Früher</button>
    <button id="outside" form="login" type="submit">Absenden</button><label id="cover" for="go">Cookies</label>`;
  let clock = 10_000;
  const timers: (() => void)[] = [];
  const frame = fakeFrame();
  const sent: CaptureRequest[] = [];
  const deps: SaveWatchDeps = {
    frame,
    mayCapture: () => true,
    send: vi.fn(async (request: CaptureRequest): Promise<SaveAnswer> => {
      sent.push(request);
      return request.type === "save-pending" ? pending : { ok: true };
    }),
    extensionId: ID,
    random: (length) => new Uint8Array(length).fill(171),
    now: () => clock,
    repeat: (run) => timers.push(run),
    stop: (timer) => {
      timers.splice((timer as number) - 1, 1, () => {});
    },
    shown: (input) => input.style.display !== "none",
    ...overrides,
  };
  const watch = createSaveWatch(deps);
  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const tick = (ms: number) => {
    clock += ms;
    for (const run of [...timers]) run();
  };
  /** A real click or key press, by default into the login form's password field */
  const act = (target: EventTarget = el("pass")) => watch.onUserAction(event(target));
  return { watch, frame, sent, el, tick, act, advance: (ms: number) => (clock += ms) };
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const captures = (sent: CaptureRequest[]) => sent.filter((r) => r.type === "save-capture");

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 16, y: 16, width: 240, height: 32 }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("capturing a submitted login", () => {
  it("hands a submit right after a real click or key press to the worker", async () => {
    const { watch, sent, el, act } = setup();
    act();
    watch.onSubmit(event(el("login")));
    await settle();
    expect(captures(sent)).toEqual([
      { type: "save-capture", username: "jonas.weber", password: "Kupfer-Rohr-17!" },
    ]);
  });

  it("captures nothing from a submit the page made up or made without the user", async () => {
    const { watch, sent, el, act, advance } = setup();
    // Not delivered by the browser
    act();
    watch.onSubmit(event(el("login"), {}, false));
    // Delivered, but no click or key press of the user before it (requestSubmit on a timer)
    advance(ACTION_MS + 1);
    watch.onSubmit(event(el("login")));
    // A click or key press the page made up does not count either
    watch.onUserAction(event(document.body, {}, false));
    watch.onSubmit(event(el("login")));
    await settle();
    expect(captures(sent)).toEqual([]);
  });

  it("captures nothing when the user's click or key press was not on the login", async () => {
    const { watch, sent, el, act } = setup();
    // A real click on another button (a cookie banner), then the page's requestSubmit()
    act(el("before"));
    watch.onSubmit(event(el("login")));
    // A label elsewhere that the browser turns into a click on the form's button
    act(el("cover"));
    watch.onClick(event(el("go")));
    // A real click elsewhere, then the page's click() on the formless button: a click it made up
    // is untrusted anyway, but neither does a real one outside the button count for it
    act(el("before"));
    watch.onClick(event(el("fgo")));
    // A real key press in another field, then Enter the page claims for the formless field
    act(el("user"));
    watch.onKeyDown(event(el("fpass"), { key: "Enter" }));
    await settle();
    expect(captures(sent)).toEqual([]);
  });

  it("takes a submit after a click or key press anywhere in the form or on its own button", async () => {
    const { watch, sent, el, act } = setup();
    act(el("user"));
    watch.onSubmit(event(el("login")));
    await settle();
    (el("pass") as HTMLInputElement).value = "Kupfer-Rohr-18!";
    act(el("outside"));
    watch.onSubmit(event(el("login")));
    await settle();
    expect(captures(sent).map((r) => r.type === "save-capture" && r.password)).toEqual([
      "Kupfer-Rohr-17!",
      "Kupfer-Rohr-18!",
    ]);
  });

  it("captures nothing in a frame it may not fill and nothing from a hidden password field", async () => {
    const foreign = setup({ mayCapture: () => false });
    foreign.act();
    foreign.watch.onSubmit(event(foreign.el("login")));
    await settle();
    expect(captures(foreign.sent)).toEqual([]);

    const hidden = setup();
    hidden.el("pass").style.display = "none";
    hidden.act();
    hidden.watch.onSubmit(event(hidden.el("login")));
    await settle();
    expect(captures(hidden.sent)).toEqual([]);
  });

  it("takes a click on a login form's button, and on one after a formless password field", async () => {
    const { watch, sent, el, act } = setup();
    act();
    watch.onClick(event(el("go")));
    await settle();
    act(el("fgo"));
    watch.onClick(event(el("fgo")));
    await settle();
    // A button before the formless password field signs nothing in
    act(el("before"));
    watch.onClick(event(el("before")));
    await settle();
    expect(captures(sent).map((r) => r.type === "save-capture" && r.username)).toEqual([
      "jonas.weber",
      "anna",
    ]);
  });

  it("takes Enter in a formless login field, leaves a form's Enter to its submit", async () => {
    const { watch, sent, el, act } = setup();
    act(el("fpass"));
    watch.onKeyDown(event(el("fpass"), { key: "Enter" }));
    act(el("pass"));
    watch.onKeyDown(event(el("pass"), { key: "Enter" }));
    watch.onKeyDown(event(el("fpass"), { key: "a" }));
    await settle();
    expect(captures(sent).map((r) => r.type === "save-capture" && r.username)).toEqual(["anna"]);
  });

  it("captures the same login once for a click and the submit it leads to", async () => {
    const { watch, sent, el, act } = setup();
    act();
    watch.onClick(event(el("go")));
    await settle();
    watch.onSubmit(event(el("login")));
    await settle();
    expect(captures(sent)).toHaveLength(1);
  });
});

describe("offering the login", () => {
  it("asks the worker when the top frame loads and opens the prompt hidden if there is a login", async () => {
    const { watch, frame, sent } = setup();
    watch.onLoad();
    await settle();
    expect(sent).toEqual([{ type: "save-pending" }]);
    expect(frame.open).toHaveBeenCalledWith(NONCE);
    expect(frame.show).not.toHaveBeenCalled();
  });

  it("opens nothing when the worker has nothing, and asks nothing in a child frame", async () => {
    const none = setup({}, { ok: false, error: "nothing" });
    none.watch.onLoad();
    await settle();
    expect(none.frame.open).not.toHaveBeenCalled();
    const child = setup({ frame: undefined });
    child.watch.onLoad();
    await settle();
    expect(child.sent).toEqual([]);
  });

  it("on a page that stays, asks once the submitted password field is gone", async () => {
    const { watch, frame, sent, el, act, tick } = setup();
    act();
    watch.onClick(event(el("go")));
    await settle();
    tick(250);
    expect(sent.filter((r) => r.type === "save-pending")).toEqual([]);
    el("login").remove();
    tick(250);
    await settle();
    expect(sent.filter((r) => r.type === "save-pending")).toHaveLength(1);
    expect(frame.open).toHaveBeenCalledOnce();
  });

  it("asks also when the field is hidden, never when it stays or is only emptied", async () => {
    const hidden = setup();
    hidden.act();
    hidden.watch.onClick(event(hidden.el("go")));
    await settle();
    hidden.el("login").style.display = "none";
    // The field itself hides with its form (the fake shown reads the field's own style)
    hidden.el("pass").style.display = "none";
    hidden.tick(250);
    await settle();
    expect(hidden.frame.open).toHaveBeenCalledOnce();

    const stays = setup();
    stays.act();
    stays.watch.onClick(event(stays.el("go")));
    await settle();
    (stays.el("pass") as HTMLInputElement).value = "";
    stays.tick(WATCH_MS);
    stays.el("login").remove();
    stays.tick(250);
    await settle();
    expect(stays.sent.filter((r) => r.type === "save-pending")).toEqual([]);
  });

  it("stops watching when the page is left: the next page asks", async () => {
    const { watch, sent, el, act, tick } = setup();
    act();
    watch.onClick(event(el("go")));
    await settle();
    watch.onPageHide();
    el("login").remove();
    tick(250);
    await settle();
    expect(sent.filter((r) => r.type === "save-pending")).toEqual([]);
  });
});

describe("the prompt's messages", () => {
  const opened = async () => {
    const setupResult = setup();
    setupResult.watch.onLoad();
    await settle();
    return setupResult;
  };

  it("acts only on the worker's messages for the prompt it opened", async () => {
    const { watch, frame } = await opened();
    expect(watch.onMessage({ type: "kennwort-prompt-owns", nonce: NONCE }, WORKER)).toEqual({
      ok: true,
    });
    expect(watch.onMessage({ type: "kennwort-prompt-show", nonce: NONCE }, WORKER)).toEqual({
      ok: true,
    });
    expect(frame.show).toHaveBeenCalledOnce();
    watch.onMessage({ type: "kennwort-prompt-size", nonce: NONCE, height: 150 }, WORKER);
    expect(frame.resize).toHaveBeenCalledWith(150);
    // Another nonce, a page's tab, another extension: nothing
    expect(
      watch.onMessage({ type: "kennwort-prompt-show", nonce: "cd".repeat(16) }, WORKER),
    ).toBeUndefined();
    expect(
      watch.onMessage({ type: "kennwort-prompt-show", nonce: NONCE }, { id: ID, tab: {} }),
    ).toBeUndefined();
    expect(
      watch.onMessage({ type: "kennwort-prompt-show", nonce: NONCE }, { id: "x" }),
    ).toBeUndefined();
    expect(frame.show).toHaveBeenCalledOnce();
  });

  it("reports whether the prompt is clear, and forgets the nonce when it closes", async () => {
    const { watch, frame } = await opened();
    frame.isClear.mockReturnValue(false);
    expect(watch.onMessage({ type: "kennwort-prompt-check", nonce: NONCE }, WORKER)).toEqual({
      ok: false,
    });
    watch.onMessage({ type: "kennwort-prompt-close", nonce: NONCE }, WORKER);
    expect(frame.close).toHaveBeenCalledOnce();
    expect(watch.onMessage({ type: "kennwort-prompt-owns", nonce: NONCE }, WORKER)).toBeUndefined();
  });

  it("answers nothing before a prompt was opened", () => {
    const { watch } = setup();
    expect(watch.onMessage({ type: "kennwort-prompt-owns", nonce: NONCE }, WORKER)).toBeUndefined();
  });

  // K-405: the worker opens the prompt for a phishing warning, which then pins itself
  it("opens the prompt hidden when the worker pushes a warning, and pins it when asked", () => {
    const { watch, frame } = setup();
    expect(watch.onMessage({ type: "kennwort-alert-open" }, WORKER)).toEqual({ ok: true });
    expect(frame.open).toHaveBeenCalledExactlyOnceWith(NONCE);
    expect(watch.onMessage({ type: "kennwort-prompt-pin", nonce: NONCE }, WORKER)).toEqual({
      ok: true,
    });
    expect(frame.pin).toHaveBeenCalledOnce();
    // From a page or another extension, or in a child frame: nothing opens
    expect(watch.onMessage({ type: "kennwort-alert-open" }, { id: ID, tab: {} })).toBeUndefined();
    expect(watch.onMessage({ type: "kennwort-alert-open" }, { id: "x" })).toBeUndefined();
    const child = setup({ frame: undefined });
    expect(child.watch.onMessage({ type: "kennwort-alert-open" }, WORKER)).toBeUndefined();
    expect(frame.open).toHaveBeenCalledOnce();
  });
});
