import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { chunk, deviceLink, kitMarks, kitPdf, qrMarks, runs, wrap } from "./kit-pdf.ts";
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
    expect(file).toContain(
      "/Title <FEFF004B0065006E006E0077006F00720074002020130020005200650063006F0076006500720079002D004B00690074>",
    );
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

describe("long values", () => {
  // Review of K-303: a long server address ran off the paper
  it("break into lines that stay between the margins, and push what follows down", () => {
    const server =
      "https://kennwort.weber-haustechnik-sanitaer-heizung.kunden.example-hosting.de/x/y/z";
    const marks = kitMarks({ ...kit, server });
    const mono = marks.filter((mark) => mark.kind === "text" && mark.font === "mono");
    for (const mark of mono)
      if (mark.kind === "text")
        expect(mark.x + mark.text.length * 0.6 * mark.size).toBeLessThanOrEqual(595.28 - 56);
    const shown = mono.flatMap((mark) => (mark.kind === "text" ? [mark.text] : []));
    expect(shown.join("")).toContain(server);
    const lowest = (all: typeof marks) => Math.min(...all.map((mark) => mark.y));
    const rects = (all: typeof marks) => all.filter((mark) => mark.kind === "rect");
    expect(lowest(rects(marks))).toBeLessThan(lowest(rects(kitMarks(kit))));
  });

  it("chunk cuts at the width", () => {
    expect(chunk("abcdefg", 3)).toEqual(["abc", "def", "g"]);
    expect(chunk("abc", 3)).toEqual(["abc"]);
    expect(chunk("", 3)).toEqual([""]);
  });
});

describe("wrap", () => {
  it("breaks at spaces without exceeding the width", () => {
    expect(wrap("eins zwei drei vier", 9)).toEqual(["eins zwei", "drei vier"]);
    expect(wrap("eins zwei drei", 14)).toEqual(["eins zwei drei"]);
    expect(wrap("überlangeswort kurz", 5)).toEqual(["überlangeswort", "kurz"]);
  });
});
