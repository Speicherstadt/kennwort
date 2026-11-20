/**
 * A minimal PDF 1.4 writer for the recovery kit (P-12): one A4 page, the standard fonts Helvetica
 * and Courier (WinAnsi, so German umlauts print), text and filled rectangles. Written here instead
 * of a PDF library, so the code that sees the Secret Key and the Recovery Key stays this file.
 * Format: ISO 32000-1, sections 7.5 (file structure) and 9.6 (simple fonts).
 */

export const A4 = { width: 595.28, height: 841.89 } as const;

export type Font = "sans" | "sans-bold" | "mono";
export type Mark =
  | { kind: "text"; x: number; y: number; size: number; font: Font; text: string }
  | { kind: "rect"; x: number; y: number; width: number; height: number; gray: number };

const FONTS: Record<Font, { name: string; base: string }> = {
  sans: { name: "F1", base: "Helvetica" },
  "sans-bold": { name: "F2", base: "Helvetica-Bold" },
  mono: { name: "F3", base: "Courier" },
};

/** WinAnsi beyond Latin-1, by code point: euro sign, quotes, ellipsis, bullet and dashes, as German and English texts use them (§D.2) */
const WIN_ANSI: Record<number, number> = {
  8364: 0x80,
  8222: 0x84,
  8230: 0x85,
  8216: 0x91,
  8217: 0x92,
  8220: 0x93,
  8221: 0x94,
  8226: 0x95,
  8211: 0x96,
  8212: 0x97,
};

/** WinAnsi codes for the text; what the encoding cannot print becomes "?" */
const winAnsi = (text: string) =>
  Array.from(text, (char) => {
    const code = char.codePointAt(0) ?? 63;
    return WIN_ANSI[code] ?? (code < 128 || (code >= 160 && code < 256) ? code : 63);
  });

/** A PDF literal string: backslash, parentheses and bytes outside ASCII escaped (§7.3.4.2) */
export const literal = (text: string) =>
  `(${winAnsi(text)
    .map((code) =>
      code === 0x5c || code === 0x28 || code === 0x29
        ? `\\${String.fromCharCode(code)}`
        : code < 32 || code > 126
          ? `\\${code.toString(8).padStart(3, "0")}`
          : String.fromCharCode(code),
    )
    .join("")})`;

/**
 * A text string for the document information (§7.9.2.2): UTF-16BE with a byte order mark, as hex.
 * Not WinAnsi: viewers read these strings as PDFDocEncoding, where 0x96 would be "OE", not a dash.
 */
export const textString = (text: string) => {
  const units = Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
  return `<FEFF${units.map((unit) => unit.toString(16).toUpperCase().padStart(4, "0")).join("")}>`;
};

const number = (value: number) => String(Math.round(value * 100) / 100);

const operators = (mark: Mark) =>
  mark.kind === "text"
    ? `BT /${FONTS[mark.font].name} ${number(mark.size)} Tf ${number(mark.x)} ${number(mark.y)} Td ${literal(mark.text)} Tj ET`
    : `${number(mark.gray)} g ${number(mark.x)} ${number(mark.y)} ${number(mark.width)} ${number(mark.height)} re f`;

/** The page's marks as a complete PDF file; y counts from the bottom of the page, as in PDF */
export const pdfDocument = (marks: readonly Mark[], title: string): Uint8Array => {
  const content = marks.map(operators).join("\n");
  const fonts = Object.values(FONTS)
    .map(({ name }, index) => `/${name} ${6 + index} 0 R`)
    .join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << ${fonts} >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Title ${textString(title)} /Producer (Kennwort) >>`,
    ...Object.values(FONTS).map(
      ({ base }) =>
        `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`,
    ),
  ];
  // Every character so far is one byte (literal() escapes the rest), so offsets are string lengths
  let file = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = file.length;
    file += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  file += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(file, (char) => char.charCodeAt(0));
};
