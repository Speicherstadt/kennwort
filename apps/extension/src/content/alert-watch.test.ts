import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlertAnswer, AlertRequest } from "../alert/messages.ts";
import { type AlertWatchDeps, createAlertWatch } from "./alert-watch.ts";

// K-405: the content script checks what the user typed into a password field when the user leaves
// the field or submits, never per key, and hands the worker only the F-10 tag, never the value
const SALT = "07".repeat(16);
const PASSWORD = "Kupfer-Rohr-18!";

/** An event as the browser would deliver it; happy-dom's own are never trusted */
const event = <T extends Event>(target: EventTarget, extra: object = {}, isTrusted = true) =>
  ({ isTrusted, target, composedPath: () => [target], ...extra }) as unknown as T;

const setup = (
  overrides: Partial<AlertWatchDeps> = {},
  saltAnswer: AlertAnswer = { ok: true, salt: SALT },
) => {
  document.body.innerHTML = `<form id="login"><input id="user" value="jonas.weber">
    <input id="pass" type="password"><input id="other" type="password"></form>
    <input id="text" type="text"><input id="hidden" type="password" style="display:none">`;
  const sent: AlertRequest[] = [];
  const tag = vi.fn((value: string, salt: Uint8Array) =>
    Uint8Array.from([value.length, salt[0] ?? 0, 0, 1]),
  );
  const deps: AlertWatchDeps = {
    mayCheck: () => true,
    send: vi.fn(async (request: AlertRequest): Promise<AlertAnswer> => {
      sent.push(request);
      return request.type === "alert-salt" ? saltAnswer : { ok: false, error: "no-match" };
    }),
    tag,
    shown: (input) => input.style.display !== "none",
    ...overrides,
  };
  const watch = createAlertWatch(deps);
  const el = (id: string) => document.getElementById(id) as HTMLInputElement;
  /**
   * The user types into a field: the browser fires a trusted beforeinput, which has finished its
   * dispatch (eventPhase NONE) and was not cancelled, changes the value, then fires a trusted input
   */
  const type = (id: string, value: string, trusted = true) => {
    watch.onBeforeInput(event(el(id), { eventPhase: 0, defaultPrevented: false }, trusted));
    el(id).value = value;
    watch.onInput(event(el(id), {}, trusted));
  };
  const checks = () => sent.filter((r) => r.type === "alert-check");
  return { watch, sent, el, type, tag, checks };
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("checking a typed password", () => {
  it("sends only the tag when the user leaves the field, never the value and never per key", async () => {
    const { watch, el, type, sent, checks, tag } = setup();
    watch.onFocusIn(event(el("pass")));
    await settle();
    for (const prefix of ["K", "Ku", PASSWORD]) type("pass", prefix);
    expect(checks()).toEqual([]);
    watch.onFocusOut(event(el("pass")));
    await settle();
    expect(tag).toHaveBeenCalledExactlyOnceWith(PASSWORD, expect.any(Uint8Array));
    expect(checks()).toEqual([{ type: "alert-check", tag: "0f070001" }]);
    expect(JSON.stringify(sent)).not.toContain("Kupfer");
  });

  it("hashes at once with a salt it already has, so a submit that navigates still sends", () => {
    const { watch, el, type, checks } = setup();
    watch.onFocusIn(event(el("pass")));
    return settle().then(() => {
      type("pass", PASSWORD);
      watch.onSubmit(event(el("login")));
      // Synchronous: before the page can unload
      expect(checks()).toEqual([{ type: "alert-check", tag: "0f070001" }]);
    });
  });

  it("asks for the salt first when it has none, and checks Enter in the field", async () => {
    const { watch, el, type, checks, sent } = setup();
    type("pass", PASSWORD);
    watch.onKeyDown(event(el("pass"), { key: "Enter" }));
    await settle();
    expect(sent.map((r) => r.type)).toEqual(["alert-salt", "alert-check"]);
    expect(checks()).toHaveLength(1);
  });

  it("checks a typed value once: leaving again without typing sends nothing more", async () => {
    const { watch, el, type, checks } = setup();
    type("pass", PASSWORD);
    watch.onFocusOut(event(el("pass")));
    await settle();
    watch.onFocusOut(event(el("pass")));
    watch.onSubmit(event(el("login")));
    await settle();
    expect(checks()).toHaveLength(1);
  });

  it("checks nothing the page set itself, and nothing on events the page made up", async () => {
    const { watch, el, type, checks } = setup();
    // The page fills a guess by script: no trusted input
    type("pass", PASSWORD, false);
    watch.onFocusOut(event(el("pass")));
    watch.onSubmit(event(el("login")));
    // A made-up submit or Enter does not check a typed value either
    type("other", PASSWORD);
    watch.onSubmit(event(el("login"), {}, false));
    watch.onKeyDown(event(el("other"), { key: "Enter" }, false));
    await settle();
    expect(checks()).toEqual([]);
  });

  // Review of K-405: in Chromium, document.execCommand("insertText") fires a trusted input event
  // without any user action, but no beforeinput; a page could probe guess after guess
  it("checks nothing a page wrote with execCommand: a trusted input without the user's beforeinput", async () => {
    const { watch, el, checks } = setup();
    watch.onFocusIn(event(el("pass")));
    await settle();
    el("pass").value = PASSWORD;
    watch.onInput(event(el("pass")));
    watch.onFocusOut(event(el("pass")));
    // Nor one written from inside the dispatch of the user's beforeinput, or after cancelling it
    watch.onBeforeInput(event(el("pass"), { eventPhase: 2, defaultPrevented: false }));
    watch.onInput(event(el("pass")));
    watch.onFocusOut(event(el("pass")));
    watch.onBeforeInput(event(el("pass"), { eventPhase: 0, defaultPrevented: true }));
    watch.onInput(event(el("pass")));
    watch.onFocusOut(event(el("pass")));
    await settle();
    expect(checks()).toEqual([]);
  });

  it("checks nothing the page changed after the user typed, nor after its own execCommand", async () => {
    const { watch, el, type, checks } = setup();
    watch.onFocusIn(event(el("pass")));
    await settle();
    type("pass", "x");
    el("pass").value = PASSWORD;
    watch.onFocusOut(event(el("pass")));
    type("pass", "y");
    el("pass").value = PASSWORD;
    watch.onInput(event(el("pass")));
    watch.onSubmit(event(el("login")));
    await settle();
    expect(checks()).toEqual([]);
  });

  it("checks nothing in a hidden field, a text field, an empty one, or a frame it may not trust", async () => {
    const { watch, el, type, checks } = setup();
    type("hidden", PASSWORD);
    watch.onFocusOut(event(el("hidden")));
    type("text", PASSWORD);
    watch.onFocusOut(event(el("text")));
    type("pass", "");
    watch.onFocusOut(event(el("pass")));
    await settle();
    expect(checks()).toEqual([]);

    const foreign = setup({ mayCheck: () => false });
    foreign.type("pass", PASSWORD);
    foreign.watch.onFocusOut(event(foreign.el("pass")));
    await settle();
    expect(foreign.sent).toEqual([]);
  });

  it("checks nothing while locked: the worker has no salt", async () => {
    const { watch, el, type, sent } = setup({}, { ok: false, error: "locked" });
    watch.onFocusIn(event(el("pass")));
    await settle();
    type("pass", PASSWORD);
    watch.onFocusOut(event(el("pass")));
    await settle();
    expect(sent.map((r) => r.type)).toEqual(["alert-salt", "alert-salt"]);
  });
});
