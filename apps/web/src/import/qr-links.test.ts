import { describe, expect, it } from "vitest";
import google from "../../../../packages/core/src/import/fixtures/google-authenticator.txt?raw";
import { qrProgress, withLink } from "./qr-links.ts";

// K-503: the import collects the QR codes of a Google Authenticator export and says how many of
// how many it has read
const [first = "", second = ""] = google.trim().split("\n");

describe("collecting migration QR codes", () => {
  it("takes each migration link once, trimmed, and nothing else", () => {
    expect(withLink([], ` ${first}\n`)).toEqual([first]);
    expect(withLink([first], second)).toEqual([first, second]);
    expect(withLink([first], first)).toEqual([first]);
    expect(withLink([first], "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP")).toBeUndefined();
    expect(withLink([], "https://weber-haustechnik.example")).toBeUndefined();
  });

  it("counts the codes read of the codes in their export", () => {
    expect(qrProgress([])).toEqual({ read: 0, total: 0 });
    expect(qrProgress([first])).toEqual({ read: 1, total: 2 });
    expect(qrProgress([second, first])).toEqual({ read: 2, total: 2 });
    // The same code with other spaces around it, and a line that is no link
    expect(qrProgress([first, ` ${first} `, "kein Link"])).toEqual({ read: 1, total: 2 });
  });
});
