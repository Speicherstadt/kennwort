/**
 * A QR code as one SVG path: each run of dark modules in a row is one rectangle, so the code is
 * drawn as elements, not as markup from a library (uqr encodes, Kennwort draws)
 */
import { encode } from "uqr";
import { runs } from "../kit/kit-pdf.ts";

export const qrPath = (text: string) => {
  const qr = encode(text, { ecc: "M", border: 2 });
  const d = qr.data
    .flatMap((row, y) => runs(row).map(([x, length]) => `M${x} ${y}h${length}v1h-${length}z`))
    .join("");
  return { size: qr.size, d };
};
