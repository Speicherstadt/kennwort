import { describe, expect, it } from "vitest";
import type { EntryContent, Field } from "../sync/content.ts";
import {
  addTotp,
  type CodeCandidate,
  codeCandidates,
  codeOf,
  type VaultLogin,
} from "./match-codes.ts";

// K-503 Teil 2: a code from an authenticator app is offered to the login of the target vault with
// the same service (title, or the host of its address) and the same username; a login that holds
// another code already is a conflict and is never overwritten, the same code is a duplicate
const DATEV =
  "otpauth://totp/DATEV:jonas%40weber-haustechnik.example?secret=JBSWY3DPEHPK3PXP&issuer=DATEV";
const OTHER = "otpauth://totp/DATEV:jonas?secret=KRUGKIDROVUWG2ZAMJZG653OEBTG66BA&issuer=DATEV";

const field = (id: string, value: string, kind: Field["kind"]): Field => ({
  id,
  name: id,
  value,
  kind,
});
const content = (title: string, fields: Field[], type: EntryContent["type"] = "login") => ({
  type,
  title,
  fields,
  tags: [],
  favorite: false,
  history: [],
});
/** A code as the authenticator parsers make it: issuer as title, account as username */
const code = (title: string, account: string, totp = DATEV) =>
  content(title, [field("username", account, "text"), field("totp", totp, "totp")]);
/** A login of the target vault */
const vaultLogin = (
  id: string,
  title: string,
  username: string,
  more: Field[] = [],
  type: EntryContent["type"] = "login",
): VaultLogin => ({ id, type, title, fields: [field("username", username, "text"), ...more] });
const site = (url: string) => field("website", url, "url");
const totp = (value: string) => field("totp", value, "totp");
const free = (id: string): CodeCandidate => ({ id, state: "free" });

describe("a code", () => {
  it("is a login with a one-time code and neither password nor address", () => {
    expect(codeOf(code(" DATEV ", " jonas "))).toEqual({
      title: "DATEV",
      account: "jonas",
      totp: DATEV,
    });
  });

  it("is not a login with a password, an address, no code or another type", () => {
    const base = code("DATEV", "jonas").fields;
    expect(codeOf(content("DATEV", [...base, field("password", "x", "secret")]))).toBeUndefined();
    expect(codeOf(content("DATEV", [...base, site("https://datev.de")]))).toBeUndefined();
    expect(codeOf(content("DATEV", [field("username", "jonas", "text")]))).toBeUndefined();
    expect(codeOf(content("DATEV", [totp(" ")]))).toBeUndefined();
    expect(codeOf(content("DATEV", base, "note"))).toBeUndefined();
  });

  it("may keep an empty password field and has no account without a username", () => {
    const empty = content("DATEV", [field("password", "", "secret"), totp(DATEV)]);
    expect(codeOf(empty)).toEqual({ title: "DATEV", account: "", totp: DATEV });
    const late = content("DATEV", [totp(DATEV), field("username", "jonas", "text")]);
    expect(codeOf(late)).toEqual({ title: "DATEV", account: "jonas", totp: DATEV });
  });
});

describe("the logins a code is offered to", () => {
  it("are the logins with the same title and username", () => {
    const logins = [
      vaultLogin("a", "DATEV", "jonas"),
      vaultLogin("b", "DATEV", "anna"),
      vaultLogin("c", "Sparkasse", "jonas"),
    ];
    expect(codeCandidates(code("DATEV", "jonas"), logins)).toEqual([free("a")]);
  });

  it("compare titles without case, spaces, punctuation and Unicode forms", () => {
    const logins = [
      vaultLogin("a", "  datev ", "jonas"),
      vaultLogin("b", "GROSSHANDEL PORTAL", "sandra"),
      vaultLogin("c", "Büro-Server", "max"),
      vaultLogin("d", "ＤＡＴＥＶ", "jonas"),
      vaultLogin("e", "DATEV®+", "jonas"),
    ];
    expect(codeCandidates(code("DATEV", "jonas"), logins)).toEqual([
      free("a"),
      free("d"),
      free("e"),
    ]);
    expect(codeCandidates(code("Großhandel-Portal", "sandra"), logins)).toEqual([free("b")]);
    expect(codeCandidates(code("Büro Server!", "max"), logins)).toEqual([free("c")]);
  });

  it("match by the host of an address: the issuer as a host, or as its name before the ending", () => {
    const logins = [
      vaultLogin("a", "Lohn", "jonas", [site("https://www.datev.de:8443/login")]),
      vaultLogin("b", "Portal", "jonas", [site("datev.de")]),
      vaultLogin("c", "Lohn", "jonas", [site("https://datev.example.org")]),
      vaultLogin("d", "Bank", "jonas", [site("https://mydatev.de")]),
      vaultLogin("e", "Mail", "jonas", [site("not a url")]),
      vaultLogin("f", "Lohn", "jonas", [site("https://mywww.datev.de")]),
    ];
    expect(codeCandidates(code("mydatev.de", "jonas"), logins).map((c) => c.id)).toEqual(["d"]);
    expect(codeCandidates(code("DATEV GmbH", "jonas"), logins)).toEqual([]);
    expect(codeCandidates(code("DATEV", "jonas"), logins).map((c) => c.id)).toEqual([
      "a",
      "b",
      "f",
    ]);
    expect(codeCandidates(code("www.DATEV.de.", "jonas"), logins).map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
    expect(codeCandidates(code("datev.example.org", "jonas"), logins).map((c) => c.id)).toEqual([
      "c",
    ]);
  });

  it("match international hosts in either spelling", () => {
    const logins = [vaultLogin("a", "Shop", "max", [site("https://xn--bcher-kva.de")])];
    expect(codeCandidates(code("bücher.de", "max"), logins)).toEqual([free("a")]);
    expect(codeCandidates(code("Bücher", "max"), logins)).toEqual([free("a")]);
  });

  it("compare an email without case, any other username exactly", () => {
    const logins = [
      vaultLogin("a", "DATEV", "Jonas@Weber-Haustechnik.example"),
      vaultLogin("b", "DATEV", "Jonas"),
      vaultLogin("c", "DATEV", " jonas "),
    ];
    expect(codeCandidates(code("DATEV", "jonas@weber-haustechnik.example"), logins)).toEqual([
      free("a"),
    ]);
    expect(codeCandidates(code("DATEV", "jonas"), logins)).toEqual([free("c")]);
  });

  it("are none for a code without a username, an empty title or a login of another type", () => {
    expect(codeCandidates(code("DATEV", ""), [vaultLogin("a", "DATEV", "")])).toEqual([]);
    expect(codeCandidates(code("!!", "jonas"), [vaultLogin("a", "?", "jonas")])).toEqual([]);
    expect(
      codeCandidates(code("DATEV", "jonas"), [vaultLogin("a", "DATEV", "jonas", [], "note")]),
    ).toEqual([]);
  });

  it("are none for an entry that is not a code", () => {
    const login = content("DATEV", [
      field("username", "jonas", "text"),
      field("password", "x", "secret"),
    ]);
    expect(codeCandidates(login, [vaultLogin("a", "DATEV", "jonas")])).toEqual([]);
  });

  it("are all of several, never one picked", () => {
    const logins = [vaultLogin("a", "DATEV", "jonas"), vaultLogin("b", "datev", "jonas")];
    expect(codeCandidates(code("DATEV", "jonas"), logins)).toEqual([free("a"), free("b")]);
  });

  it("say whether a login has no code, the same code or another one", () => {
    const sameKeyOtherLink = "jbswy3dpehpk3pxp";
    const logins = [
      vaultLogin("free", "DATEV", "jonas", [totp(" ")]),
      vaultLogin("same", "DATEV", "jonas", [totp(DATEV)]),
      vaultLogin("same-key", "DATEV", "jonas", [totp(sameKeyOtherLink)]),
      vaultLogin("conflict", "DATEV", "jonas", [totp(OTHER)]),
      vaultLogin("both", "DATEV", "jonas", [totp(OTHER), totp(DATEV)]),
    ];
    const plain = "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP";
    expect(codeCandidates(code("DATEV", "jonas", plain), logins)).toEqual([
      { id: "free", state: "free" },
      { id: "same", state: "same" },
      { id: "same-key", state: "same" },
      { id: "conflict", state: "conflict" },
      { id: "both", state: "same" },
    ]);
  });

  it("count another algorithm, number of digits or period as another code", () => {
    const base = "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP";
    const logins = [
      vaultLogin("algorithm", "DATEV", "jonas", [totp(`${base}&algorithm=SHA256`)]),
      vaultLogin("digits", "DATEV", "jonas", [totp(`${base}&digits=8`)]),
      vaultLogin("period", "DATEV", "jonas", [totp(`${base}&period=60`)]),
      vaultLogin("secret", "DATEV", "jonas", [totp("JBSWY3DPEHPK3PXA")]),
    ];
    expect(codeCandidates(code("DATEV", "jonas", base), logins).map((c) => c.state)).toEqual([
      "conflict",
      "conflict",
      "conflict",
      "conflict",
    ]);
  });

  it("compare a value that is no key by its text", () => {
    const logins = [
      vaultLogin("same", "DATEV", "jonas", [totp(" kein schlüssel ")]),
      vaultLogin("other", "DATEV", "jonas", [totp("anderer")]),
    ];
    expect(codeCandidates(code("DATEV", "jonas", "kein schlüssel"), logins)).toEqual([
      { id: "same", state: "same" },
      { id: "other", state: "conflict" },
    ]);
  });
});

describe("adding a code to a login", () => {
  const datev = content("DATEV", [field("username", "jonas", "text"), site("https://datev.de")]);

  it("adds the field „Einmalcode“ and keeps the rest", () => {
    expect(addTotp(datev, DATEV)).toEqual({
      ok: true,
      value: {
        ...datev,
        fields: [
          ...datev.fields,
          { id: "totp", name: "One-time code", value: DATEV, kind: "totp" },
        ],
      },
    });
  });

  it("fills an empty code field in its place", () => {
    const empty = { ...datev, fields: [totp(""), ...datev.fields] };
    expect(addTotp(empty, DATEV)).toEqual({
      ok: true,
      value: { ...datev, fields: [totp(DATEV), ...datev.fields] },
    });
  });

  it("takes a free ID when another field has the code's", () => {
    const taken = {
      ...datev,
      fields: [field("totp", "Notiz", "text"), field("totp-2", "", "text")],
    };
    const added = addTotp(taken, DATEV);
    expect(added.ok && added.value.fields.at(-1)).toEqual({
      id: "totp-3",
      name: "One-time code",
      value: DATEV,
      kind: "totp",
    });
  });

  it("never overwrites another code, and adds the same one not twice", () => {
    const other = { ...datev, fields: [...datev.fields, totp(""), totp(OTHER)] };
    expect(addTotp(other, DATEV)).toEqual({ ok: false, error: "conflict" });
    const same = { ...datev, fields: [...datev.fields, totp(DATEV)] };
    expect(addTotp(same, DATEV)).toEqual({ ok: false, error: "same" });
  });
});
