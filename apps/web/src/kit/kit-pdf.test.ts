import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { deviceLink, kitMarks, kitPdf, qrMarks, runs, wrap } from "./kit-pdf.ts";
import type { Mark } from "./pdf.ts";

const texts = {
  title: "Kennwort – Recovery-Kit",
  intro: "Mit Konto-ID, Secret Key und Passphrase entsperrst du ein neues Gerät.",
  server: "Server",
  account: "Konto-ID",
  secretKey: "Secret Key",
  recoveryKey: "Recovery Key",
  created: "Erstellt am",
  qr: "Scannen, um ein neues Gerät anzumelden.",
  keep: "Sicher aufbewahren.",
};
const kit = {
  server: "https://kennwort.weber-haustechnik.de/",
  accountId: "AQEBAQEBAQEBAQEBAQEBAQ",
  secretKey: "K1-ABCDE-FGHJK-MNPQR-STVWX-YZ012",
  recoveryKey: "R1-AAAAA-BBBBB-CCCCC",
  created: "20.11.2026",
  texts,
};

describe("the recovery kit", () => {
  it("shows every key and label on the page", () => {
    const shown = kitMarks(kit).flatMap((mark) => (mark.kind === "text" ? [mark.text] : []));
    for (const value of [kit.server, kit.accountId, kit.secretKey, kit.recoveryKey, kit.created])
      expect(shown).toContain(value);
    for (const label of Object.values(texts)) expect(shown.join(" ")).toContain(label);
    const file = String.fromCharCode(...kitPdf(kit));
    expect(file).toContain("(R1-AAAAA-BBBBB-CCCCC)");
    expect(file).toContain("/Title (Kennwort \\226 Recovery-Kit)");
  });

  it("keeps everything on the page", () => {
    for (const mark of kitMarks(kit)) {
      expect(mark.x).toBeGreaterThanOrEqual(0);
      expect(mark.y).toBeGreaterThan(0);
      expect(mark.y).toBeLessThan(841.89);
    }
  });

  it("puts address, account ID and Secret Key in the link's fragment, never the Recovery Key", () => {
    const link = deviceLink(kit.server, kit.accountId, kit.secretKey);
    expect(link).toBe(
      "https://kennwort.weber-haustechnik.de/unlock#account=AQEBAQEBAQEBAQEBAQEBAQ&secret=K1-ABCDE-FGHJK-MNPQR-STVWX-YZ012",
    );
    expect(new URL(link).search).toBe("");
    expect(link).not.toContain("R1-");
  });
});

/** Paints the marks into a grey-scale bitmap, as a printer would, for a QR reader */
const paint = (marks: Mark[], box: number, scale: number) => {
  const side = box * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  for (const mark of marks) {
    if (mark.kind !== "rect") continue;
    for (
      let y = Math.round((box - mark.y - mark.height) * scale);
      y < Math.round((box - mark.y) * scale);
      y++
    )
      for (let x = Math.round(mark.x * scale); x < Math.round((mark.x + mark.width) * scale); x++)
        pixels.fill(0, (y * side + x) * 4, (y * side + x) * 4 + 3);
  }
  return { pixels, side };
};

describe("qrMarks", () => {
  it("draws a code a reader decodes back to the link", () => {
    const link = deviceLink(kit.server, kit.accountId, kit.secretKey);
    const { pixels, side } = paint(qrMarks(link, 0, 200, 200), 200, 4);
    expect(jsQR(pixels, side, side)?.data).toBe(link);
  });

  it("stays inside the given box", () => {
    const marks = qrMarks("https://example.org/", 10, 200, 100);
    expect(marks.length).toBeGreaterThan(20);
    for (const mark of marks) {
      if (mark.kind !== "rect") throw new Error("only rectangles");
      expect(mark.x).toBeGreaterThanOrEqual(10);
      expect(mark.x + mark.width).toBeLessThanOrEqual(110.0001);
      expect(mark.y).toBeGreaterThanOrEqual(99.9999);
      expect(mark.y + mark.height).toBeLessThanOrEqual(200.0001);
    }
  });
});

describe("runs", () => {
  it("joins neighbouring dark modules", () => {
    expect(runs([true, true, false, true, false, false, true, true, true])).toEqual([
      [0, 2],
      [3, 1],
      [6, 3],
    ]);
    expect(runs([false, false])).toEqual([]);
  });
});

describe("wrap", () => {
  it("breaks at spaces without exceeding the width", () => {
    expect(wrap("eins zwei drei vier", 9)).toEqual(["eins zwei", "drei vier"]);
    expect(wrap("eins zwei drei", 14)).toEqual(["eins zwei drei"]);
    expect(wrap("überlangeswort kurz", 5)).toEqual(["überlangeswort", "kurz"]);
  });
});
