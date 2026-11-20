import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { qrPath } from "./qr.ts";

/** Fills the path's rectangles into a bitmap, as a browser would draw them, for a QR reader */
const paint = (size: number, d: string, scale: number) => {
  const side = size * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  for (const [, x, y, length] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let row = Number(y) * scale; row < (Number(y) + 1) * scale; row++)
      for (let col = Number(x) * scale; col < (Number(x) + Number(length)) * scale; col++)
        pixels.fill(0, (row * side + col) * 4, (row * side + col) * 4 + 3);
  }
  return { pixels, side };
};

describe("qrPath", () => {
  it("draws a code a reader decodes back to the text", () => {
    const text = "https://kennwort.weber-haustechnik.de/link#id=abc&fp=xyz&r=123";
    const { size, d } = qrPath(text);
    const { pixels, side } = paint(size, d, 4);
    expect(jsQR(pixels, side, side)?.data).toBe(text);
  });

  it("is only rectangles inside the code's own square", () => {
    const { size, d } = qrPath("x");
    expect(d).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
    for (const [, x, y, length] of d.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      expect(Number(x) + Number(length)).toBeLessThanOrEqual(size);
      expect(Number(y)).toBeLessThan(size);
    }
  });
});
