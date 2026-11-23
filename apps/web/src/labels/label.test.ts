import jsQR from "jsqr";
import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { CAPTION_MAX, caption, LABEL_SIZES, labelLink } from "./label.ts";

// K-605: the label on the heating's router at Müller Elektro leads to its entry, and to nothing more
const VAULT = "AAECAwQFBgcICQoLDA0ODw";
const ENTRY = "EBESExQVFhcYGRobHB0eHw";

/** What a camera reads from the code: the modules drawn as pixels, four per module */
const scan = (text: string) => {
  const qr = encode(text, { ecc: "M", border: 2 });
  const scale = 4;
  const side = qr.size * scale;
  const pixels = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const dark = qr.data[Math.floor(y / scale)]?.[Math.floor(x / scale)];
      pixels.fill(dark ? 0 : 255, (y * side + x) * 4, (y * side + x) * 4 + 3);
      pixels[(y * side + x) * 4 + 3] = 255;
    }
  return jsQR(pixels, side, side)?.data;
};

describe("QR labels", () => {
  it("holds the entry's address in the app, IDs only", () => {
    const link = labelLink("https://kennwort.weber-haustechnik.test", VAULT, ENTRY);
    expect(link).toBe(`https://kennwort.weber-haustechnik.test/vaults/${VAULT}/${ENTRY}`);
    expect(scan(link ?? "")).toBe(link);
    // The origin only: a path, a query or a fragment of the page never reaches the label
    expect(labelLink("https://kennwort.test/entries?x=1#s=geheim", VAULT, ENTRY)).toBe(
      `https://kennwort.test/vaults/${VAULT}/${ENTRY}`,
    );
    expect(labelLink("http://localhost:5176", VAULT, ENTRY)).toBe(
      `http://localhost:5176/vaults/${VAULT}/${ENTRY}`,
    );
  });

  it("makes no label from anything but two IDs and a web origin", () => {
    expect(labelLink("web+kennwort://x", VAULT, ENTRY)).toBeUndefined();
    expect(labelLink("javascript:alert(1)", VAULT, ENTRY)).toBeUndefined();
    expect(labelLink("kein origin", VAULT, ENTRY)).toBeUndefined();
    expect(labelLink("https://kennwort.test", "Passwort123", ENTRY)).toBeUndefined();
    expect(labelLink("https://kennwort.test", VAULT, `${ENTRY}?p=geheim`)).toBeUndefined();
    expect(labelLink("https://kennwort.test", `${VAULT}x`, ENTRY)).toBeUndefined();
    expect(labelLink("https://kennwort.test", VAULT, `x${ENTRY}`)).toBeUndefined();
  });

  it("cuts the caption to what fits", () => {
    expect(caption("  Router Heizung  ")).toBe("Router Heizung");
    expect(caption("x".repeat(60))).toHaveLength(CAPTION_MAX);
    expect(LABEL_SIZES.map((s) => s.id)).toEqual(["62x29", "89x36", "50x50"]);
  });
});
