import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInlineMenu, type InlineMenuDeps } from "./inline-menu.ts";
import type { MenuFrame } from "./menu-frame.ts";

// K-403: the content script opens the menu on a login field, fills only on the worker's message for
// the menu it opened, only on its own host and only while the menu shows as it is
const ID = "abcdefghijklmnopabcdefghijklmnop";
const NONCE = "ab".repeat(16);
const WORKER = { id: ID };
const HOST = "portal.weber-haustechnik.test";

const fakeFrame = () =>
  ({
    open: vi.fn(),
    close: vi.fn(),
    place: vi.fn(),
    resize: vi.fn(),
    focus: vi.fn(),
    isClear: vi.fn(() => true),
    contains: vi.fn(() => false),
    field: vi.fn(),
  }) satisfies MenuFrame;

/** An event as the browser would deliver it; happy-dom's own are never trusted */
const event = <T extends Event>(target: EventTarget, extra: object = {}, isTrusted = true) =>
  ({ isTrusted, composedPath: () => [target], preventDefault: vi.fn(), ...extra }) as unknown as T;

const setup = (overrides: Partial<InlineMenuDeps> = {}) => {
  document.body.innerHTML = `<form><input id="user"><input id="pass" type="password"></form>
    <input id="search" type="search">`;
  const frame = fakeFrame();
  const menu = createInlineMenu({
    frame,
    mayOpen: () => true,
    host: () => HOST,
    extensionId: ID,
    random: (length) => new Uint8Array(length).fill(171),
    ...overrides,
  });
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  return { frame, menu, field };
};
const fill = (extra: object = {}) => ({
  type: "kennwort-fill",
  nonce: NONCE,
  host: HOST,
  username: "jonas.weber",
  password: "Kupfer-Rohr-17!",
  ...extra,
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("the inline menu in the page", () => {
  it("opens under a login field the user focuses, with a fresh nonce", () => {
    const { frame, menu, field } = setup();
    menu.onFocusIn(event(field("pass")));
    expect(frame.open).toHaveBeenCalledWith(field("pass"), NONCE);
  });

  it("opens nothing on a made-up event, a field that is no login, or a foreign frame", () => {
    const { frame, menu, field } = setup();
    menu.onFocusIn(event(field("pass"), {}, false));
    menu.onFocusIn(event(field("search")));
    expect(frame.open).not.toHaveBeenCalled();
    const foreign = setup({ mayOpen: () => false });
    foreign.menu.onFocusIn(event(foreign.field("pass")));
    expect(foreign.frame.open).not.toHaveBeenCalled();
  });

  it("fills the login on the worker's message and closes", () => {
    const { frame, menu, field } = setup();
    menu.onFocusIn(event(field("pass")));
    expect(menu.onMessage(fill(), WORKER)).toEqual({ ok: true });
    expect([field("user").value, field("pass").value]).toEqual(["jonas.weber", "Kupfer-Rohr-17!"]);
    expect(frame.close).toHaveBeenCalled();
    // The keyboard goes back to the field without opening the menu again
    menu.onFocusIn(event(field("pass")));
    expect(frame.open).toHaveBeenCalledTimes(1);
  });

  it("fills nothing while the menu is covered or faded", () => {
    const { frame, menu, field } = setup();
    menu.onFocusIn(event(field("pass")));
    frame.isClear.mockReturnValue(false);
    expect(menu.onMessage(fill(), WORKER)).toEqual({ ok: false, error: "menu-hidden" });
    expect(field("pass").value).toBe("");
  });

  it("fills nothing for another host than this document's", () => {
    const { menu, field } = setup();
    menu.onFocusIn(event(field("pass")));
    expect(menu.onMessage(fill({ host: "evil.test" }), WORKER)).toEqual({
      ok: false,
      error: "menu-moved",
    });
    expect(field("pass").value).toBe("");
  });

  it("ignores messages of another menu, of a tab, or before a menu opened", () => {
    const { menu, field } = setup();
    expect(menu.onMessage(fill(), WORKER)).toBeUndefined();
    menu.onFocusIn(event(field("pass")));
    expect(menu.onMessage(fill({ nonce: "cd".repeat(16) }), WORKER)).toBeUndefined();
    expect(menu.onMessage(fill(), { id: ID, tab: { id: 1 } })).toBeUndefined();
    expect(menu.onMessage(fill(), { id: "another-extension" })).toBeUndefined();
    expect(field("pass").value).toBe("");
  });

  it("tells the worker it opened the menu only for its own nonce", () => {
    const { menu, field } = setup();
    menu.onFocusIn(event(field("pass")));
    expect(menu.onMessage({ type: "kennwort-owns", nonce: NONCE }, WORKER)).toEqual({ ok: true });
    expect(
      menu.onMessage({ type: "kennwort-owns", nonce: "cd".repeat(16) }, WORKER),
    ).toBeUndefined();
  });

  it("moves the keyboard into the menu on ↓ and closes on Esc", () => {
    const { frame, menu, field } = setup();
    menu.onFocusIn(event(field("user")));
    const down = event<KeyboardEvent>(field("user"), { key: "ArrowDown" });
    menu.onKeyDown(down);
    expect(frame.focus).toHaveBeenCalled();
    expect(down.preventDefault).toHaveBeenCalled();
    menu.onKeyDown(event(field("user"), { key: "ArrowDown" }, false));
    expect(frame.focus).toHaveBeenCalledTimes(1);
    menu.onKeyDown(event(field("user"), { key: "Escape" }));
    expect(frame.close).toHaveBeenCalled();
  });

  it("closes on a click elsewhere, not on the field or the menu", () => {
    const { frame, menu, field } = setup();
    menu.onFocusIn(event(field("pass")));
    menu.onPointerDown(event(field("pass")));
    expect(frame.close).not.toHaveBeenCalled();
    menu.onPointerDown(event(document.body));
    expect(frame.close).toHaveBeenCalled();
  });

  it("resizes and closes on the menu's request, handing the keyboard back", () => {
    const { frame, menu, field } = setup();
    menu.onFocusIn(event(field("pass")));
    menu.onMessage({ type: "kennwort-menu-size", nonce: NONCE, height: 200 }, WORKER);
    expect(frame.resize).toHaveBeenCalledWith(200);
    menu.onMessage({ type: "kennwort-menu-close", nonce: NONCE }, WORKER);
    expect(frame.close).toHaveBeenCalled();
    expect(document.activeElement).toBe(field("pass"));
  });
});
