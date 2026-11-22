import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// K-601: no page of the app tells another site where it came from; a one-time link's address
// (its path with the fetch ID) must not leave in a Referer when the recipient follows a link
describe("index.html", () => {
  it("sets the referrer policy to no-referrer for every page", () => {
    const html = readFileSync(join(import.meta.dirname, "../../index.html"), "utf8");
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
  });
});
