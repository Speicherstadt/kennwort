import { describe, expect, it } from "vitest";
import { literal, pdfDocument } from "./pdf.ts";

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe("pdfDocument", () => {
  const file = text(
    pdfDocument(
      [
        { kind: "text", x: 56, y: 700.555, size: 12, font: "mono", text: "K1-ABC (Test) \\" },
        { kind: "rect", x: 1, y: 2, width: 3, height: 4, gray: 0 },
      ],
      "Recovery-Kit",
    ),
  );

  it("is a PDF 1.4 file whose cross-reference table points at each object", () => {
    expect(file.startsWith("%PDF-1.4\n")).toBe(true);
    expect(file.endsWith("%%EOF\n")).toBe(true);
    const xref = Number(file.match(/startxref\n(\d+)\n/)?.[1]);
    expect(file.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...file.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    expect(offsets).toHaveLength(8);
    offsets.forEach((offset, index) => {
      expect(file.slice(offset).startsWith(`${index + 1} 0 obj\n`)).toBe(true);
    });
    expect(file).toContain("/Size 9 /Root 1 0 R /Info 5 0 R");
  });

  it("gives the content stream its exact length and draws text and rectangles", () => {
    const length = Number(file.match(/<< \/Length (\d+) >>\nstream\n/)?.[1]);
    const start = file.indexOf("stream\n") + "stream\n".length;
    expect(file.slice(start + length)).toMatch(/^\nendstream/);
    expect(file).toContain("BT /F3 12 Tf 56 700.56 Td (K1-ABC \\(Test\\) \\\\) Tj ET");
    expect(file).toContain("0 g 1 2 3 4 re f");
    expect(file).toContain("/Title (Recovery-Kit)");
    for (const font of ["Helvetica", "Helvetica-Bold", "Courier"])
      expect(file).toContain(`/BaseFont /${font} /Encoding /WinAnsiEncoding`);
  });
});

describe("literal", () => {
  it("escapes what PDF strings need and keeps umlauts as WinAnsi bytes", () => {
    expect(literal("a(b)c\\")).toBe("(a\\(b\\)c\\\\)");
    expect(literal("Schlüssel ä ß")).toBe("(Schl\\374ssel \\344 \\337)");
    expect(literal("tab\there")).toBe("(tab\\011here)");
    expect(literal("€ – „x“ 🔑")).toBe("(\\200 \\226 \\204x\\223 ?)");
    expect(literal("\u0080\u009f")).toBe("(??)");
    expect(literal("~ ")).toBe("(~ )");
  });
});
