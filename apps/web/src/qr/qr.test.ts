import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { type Pixels, readQr } from "./qr.ts";

/** A QR code as pixels: four modules of quiet zone, each module `scale` pixels */
const pixelsOf = (text: string, scale = 4, dark = 0, light = 255): Pixels => {
  const { data: modules } = encode(text, { border: 4 });
  const size = modules.length * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const on = modules[Math.floor(y / scale)]?.[Math.floor(x / scale)];
      const value = on ? dark : light;
      data.set([value, value, value, 255], (y * size + x) * 4);
    }
  return { data, width: size, height: size };
};

const LINK = "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP&issuer=DATEV";

describe("readQr", () => {
  it("reads the setup link from a QR code", async () => {
    expect(await readQr(pixelsOf(LINK))).toBe(LINK);
  });

  it("reads a code drawn light on dark, as some dark setup pages show it", async () => {
    expect(await readQr(pixelsOf(LINK, 4, 255, 0))).toBe(LINK);
  });

  it("finds nothing in an empty picture", async () => {
    const blank = { data: new Uint8ClampedArray(100 * 100 * 4).fill(255), width: 100, height: 100 };
    expect(await readQr(blank)).toBeUndefined();
  });
});
