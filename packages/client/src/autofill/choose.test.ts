import { describe, expect, it } from "vitest";
import type { ShownEntry } from "../entries/entries.ts";
import type { FillRequest } from "./bridge.ts";
import { answerFor, appAddress, appPackages, candidates } from "./choose.ts";

// K-802: what the app offers the Android autofill service, by exact host or exact package only
const login = (id: string, ...urls: string[]): ShownEntry =>
  ({
    id,
    type: "login",
    username: `${id}@weber-haustechnik.test`,
    password: `pw-${id}`,
    fields: urls.map((value, i) => ({ id: `u${i}`, label: "", value, kind: "url" as const })),
  }) as unknown as ShownEntry;

const request = (
  target: FillRequest["target"],
  fields: FillRequest["fields"] = ["username", "password"],
): FillRequest => ({ version: 1, requestId: "r-1", target, fields });

const PORTAL = "portal.weber-haustechnik.test";
const portal = login("portal", `https://${PORTAL}/login`);
const app = login("app", "android://Zm9vYmFy@com.heizungsapp.monteur/");
const plainApp = login("plain", "android://com.heizungsapp.monteur");
const parent = login("parent", "https://weber-haustechnik.test");

describe("appPackages", () => {
  it("reads the package of Chrome's export form and of the plain form", () => {
    expect(appPackages(app)).toEqual(["com.heizungsapp.monteur"]);
    expect(appPackages(plainApp)).toEqual(["com.heizungsapp.monteur"]);
    expect(appPackages(login("x", appAddress("de.datev.uo")))).toEqual(["de.datev.uo"]);
  });

  it.each([
    "android://monteur",
    "android://com.heizungsapp.monteur/login",
    "android://1com.x",
    "androidapp://com.heizungsapp.monteur",
    "https://com.heizungsapp.monteur",
  ])("reads no package from %s", (value) => {
    expect(appPackages(login("x", value))).toEqual([]);
  });
});

describe("candidates", () => {
  const all = [portal, app, plainApp, parent];

  it("offers a web page only the entries for its exact host", () => {
    expect(candidates(request({ kind: "web", host: PORTAL }), all).map((e) => e.id)).toEqual([
      "portal",
    ]);
    expect(candidates(request({ kind: "web", host: `evil.${PORTAL}` }), all)).toEqual([]);
  });

  it("offers an app only the entries stored for its exact package", () => {
    const target = request({ kind: "app", id: "com.heizungsapp.monteur" });
    expect(candidates(target, all).map((e) => e.id)).toEqual(["app", "plain"]);
    expect(candidates(request({ kind: "app", id: "com.heizungsapp" }), all)).toEqual([]);
  });

  it("never offers a web entry to an app, nor an app entry to a web page", () => {
    expect(candidates(request({ kind: "app", id: "test.weber_haustechnik.portal" }), all)).toEqual(
      [],
    );
    expect(candidates(request({ kind: "web", host: "com.heizungsapp.monteur" }), all)).toEqual([]);
  });

  it("offers logins only", () => {
    const note = { ...portal, type: "note" } as ShownEntry;
    expect(candidates(request({ kind: "web", host: PORTAL }), [note])).toEqual([]);
  });
});

describe("answerFor", () => {
  const web = request({ kind: "web", host: PORTAL }, ["password"]);

  it("answers with the requested fields of the picked entry only", () => {
    expect(answerFor(web, [portal], "portal")).toEqual({
      version: 1,
      requestId: "r-1",
      kind: "fill",
      values: { password: "pw-portal" },
    });
  });

  it("answers nothing for an entry that is not a candidate", () => {
    expect(answerFor(web, [portal, parent], "parent")).toBeUndefined();
    expect(answerFor(web, [portal], "missing")).toBeUndefined();
  });

  it("fills no one-time code", () => {
    const totp = request({ kind: "web", host: PORTAL }, ["totp"]);
    expect(answerFor(totp, [portal], "portal")).toMatchObject({ kind: "fill", values: {} });
  });
});
