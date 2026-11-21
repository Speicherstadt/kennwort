// @vitest-environment-options {"settings":{"enableIframePageLoading":true}}
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPromptFrame, PROMPT_WIDTH, promptPlacement } from "./prompt-frame.ts";

// K-404: the save prompt is an extension iframe in a closed shadow root like the menu, created
// hidden and shown only when the prompt asks
const NONCE = "0123456789abcdef0123456789abcdef";
const PROMPT_URL = "about:blank";

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
  for (const element of document.querySelectorAll("kennwort-save")) element.remove();
});

const promptElement = () => document.querySelector<HTMLElement>("kennwort-save");

describe("promptPlacement", () => {
  it("sits at the top right, inside a narrow viewport too", () => {
    expect(promptPlacement(1280)).toEqual({ left: 1280 - PROMPT_WIDTH - 16, top: 16 });
    expect(promptPlacement(300)).toEqual({ left: 8, top: 16 });
  });
});

describe("createPromptFrame", () => {
  it("opens hidden, in a closed shadow root the page cannot reach", () => {
    const frame = createPromptFrame(document, PROMPT_URL, "Kennwort: Login speichern");
    frame.open(NONCE);
    const host = promptElement() as HTMLElement;
    expect(host.shadowRoot).toBeNull();
    expect(host.style.getPropertyValue("display")).toBe("none");
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
    expect(frame.isOpen()).toBe(true);
    // A hidden prompt is never clear: nothing is saved through it
    expect(frame.isClear()).toBe(false);
  });

  it("shows itself in the top layer at the top right when asked, and sizes within bounds", () => {
    // happy-dom has no Popover API
    const shown = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      value: shown,
      configurable: true,
    });
    const frame = createPromptFrame(document, PROMPT_URL, "Kennwort: Login speichern");
    frame.open(NONCE);
    expect(shown).not.toHaveBeenCalled();
    frame.show();
    frame.show();
    const host = promptElement() as HTMLElement;
    expect(shown).toHaveBeenCalledOnce();
    expect(host.getAttribute("popover")).toBe("manual");
    expect(host.style.getPropertyValue("display")).toBe("block");
    expect(host.style.getPropertyValue("top")).toBe("16px");
    frame.resize(5_000);
    expect(host.style.getPropertyValue("height")).toBe("420px");
    frame.resize(10);
    expect(host.style.getPropertyValue("height")).toBe("60px");
  });

  it("keeps one prompt per document and removes it on close", () => {
    const frame = createPromptFrame(document, PROMPT_URL, "Kennwort: Login speichern");
    frame.open(NONCE);
    frame.open(NONCE);
    expect(document.querySelectorAll("kennwort-save")).toHaveLength(1);
    frame.close();
    expect(promptElement()).toBeNull();
    expect(frame.isOpen()).toBe(false);
    frame.show();
    frame.resize(100);
    expect(promptElement()).toBeNull();
  });
});
