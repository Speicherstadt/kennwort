import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fieldShown } from "./field-shown.ts";

// K-403: the menu opens on, and a fill writes into, only fields the page shows the user
const box = (x: number, y: number, width: number, height: number) =>
  DOMRect.fromRect({ x, y, width, height });

/** One element laid out elsewhere (a spy on the element itself would replace the prototype's) */
const placeAt = (element: Element, rect: DOMRect) =>
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => rect,
    configurable: true,
  });

const field = (style = "", parentStyle = "") => {
  document.body.innerHTML = `<div style="${parentStyle}"><input id="f" style="${style}"></div>`;
  return document.getElementById("f") as HTMLInputElement;
};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(box(16, 16, 240, 32));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fieldShown", () => {
  it("takes an ordinary field, also one faded a little or below the fold", () => {
    expect(fieldShown(field())).toBe(true);
    expect(fieldShown(field("opacity:0.6"))).toBe(true);
    const below = field();
    placeAt(below, box(16, 2000, 240, 32));
    expect(fieldShown(below)).toBe(true);
  });

  it.each([
    ["not displayed", "display:none", ""],
    ["invisible", "visibility:hidden", ""],
    ["transparent", "opacity:0", ""],
    ["nearly transparent", "opacity:0.1", ""],
    ["in a transparent parent", "", "opacity:0.01"],
    ["faded twice", "opacity:0.4", "opacity:0.4"],
    ["in a parent not displayed", "", "display:none"],
  ])("refuses a field %s", (_, style, parentStyle) => {
    expect(fieldShown(field(style, parentStyle))).toBe(false);
  });

  it.each([
    ["a pixel small", box(16, 16, 1, 1)],
    ["without height", box(16, 16, 240, 0)],
    ["left of the page", box(-9999, 16, 240, 32)],
    ["above the page", box(16, -9999, 240, 32)],
  ])("refuses a field %s", (_, rect) => {
    const input = field();
    placeAt(input, rect);
    expect(fieldShown(input)).toBe(false);
  });

  it("refuses a field no longer in the document", () => {
    const input = field();
    input.remove();
    expect(fieldShown(input)).toBe(false);
  });
});
