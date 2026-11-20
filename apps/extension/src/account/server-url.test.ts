import { describe, expect, it } from "vitest";
import { serverOrigin } from "./server-url.ts";

describe("the server's address", () => {
  it.each([
    ["https://kennwort.weber-haustechnik.test", "https://kennwort.weber-haustechnik.test"],
    [
      "  https://Kennwort.Weber-Haustechnik.test/entries?x=1#y ",
      "https://kennwort.weber-haustechnik.test",
    ],
    ["https://kennwort.test:8443/", "https://kennwort.test:8443"],
    ["http://localhost:5176", "http://localhost:5176"],
    ["http://127.0.0.1:18100/", "http://127.0.0.1:18100"],
  ])("takes the origin of %s", (typed, origin) => {
    expect(serverOrigin(typed)).toEqual({ ok: true, value: origin });
  });

  it("refuses plain HTTP to another machine", () => {
    expect(serverOrigin("http://kennwort.weber-haustechnik.test")).toEqual({
      ok: false,
      error: "insecure-server",
    });
    expect(serverOrigin("http://localhost.evil.test")).toEqual({
      ok: false,
      error: "insecure-server",
    });
  });

  it.each([
    "",
    "kennwort.test",
    "ftp://kennwort.test",
    "javascript:alert(1)",
    "https://a:b@kennwort.test",
  ])("refuses %s", (typed) => {
    expect(serverOrigin(typed)).toEqual({ ok: false, error: "invalid-server" });
  });
});
