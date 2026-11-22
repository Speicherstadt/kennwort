/**
 * Codes to the matching login (K-503 Teil 2): a one-time code from an authenticator app is offered
 * to the logins of the target vault with the same service and username, so it can go into their
 * field „Einmalcode“ instead of becoming a login of its own. The same service is the same title
 * (without case, spaces, punctuation and Unicode forms) or an address whose host is the code's
 * title, the issuer, as a host or as the name before its ending (datev.de for DATEV); the same
 * username is equal, an email without case.
 * Several matches are all returned: which one, if any, is for the person to choose. A login that
 * holds another code already is a conflict and never gets this one; the same code is a duplicate.
 */

import { err, ok } from "../result.ts";
import type { EntryContent, Field } from "../sync/content.ts";
import { parseTotp } from "../totp/otpauth.ts";
import { known } from "./entry.ts";

/** What matching needs of an entry in the target vault */
export type VaultLogin = {
  id: string;
  type: EntryContent["type"];
  title: string;
  fields: readonly Pick<Field, "id" | "value" | "kind">[];
};

/** free: the login has no code; same: it has this one; conflict: it has another */
export type CodeState = "free" | "same" | "conflict";
export type CodeCandidate = { id: string; state: CodeState };
export type ImportedCode = { title: string; account: string; totp: string };

type SomeField = Pick<Field, "id" | "value" | "kind">;
const valuesOf = (fields: readonly SomeField[], kind: Field["kind"]) =>
  fields.filter((f) => f.kind === kind && f.value.trim() !== "").map((f) => f.value.trim());
const fieldValue = (fields: readonly SomeField[], id: string) =>
  fields.find((f) => f.id === id)?.value.trim() ?? "";

/** The code an imported entry is: a login with a one-time code and no password or address */
export const codeOf = (content: EntryContent): ImportedCode | undefined => {
  const [totp] = valuesOf(content.fields, "totp");
  const other = [...valuesOf(content.fields, "secret"), ...valuesOf(content.fields, "url")];
  if (content.type !== "login" || totp === undefined || other.length > 0) return undefined;
  return { title: content.title.trim(), account: fieldValue(content.fields, "username"), totp };
};

/** A name as compared: one Unicode form, no case (ß as ss), no spaces, punctuation or symbols */
const normalName = (text: string) =>
  text
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\p{P}\p{S}\p{Z}]/gu, "");

/** The host of an address or a name, without port, `www.` and the dot at the end; IDN as ASCII */
const hostOf = (text: string) => {
  const url = URL.parse(text.includes("://") ? text : `https://${text}`);
  return url?.hostname.replace(/\.$/, "").replace(/^www\./, "") ?? "";
};

/** The name of a host before its ending: datev for datev.de */
const siteName = (host: string) => host.split(".").at(-2);

/** The title is the issuer, as the authenticator parsers make it (authenticator.ts) */
const sameService = (code: ImportedCode, login: VaultLogin) => {
  const name = normalName(code.title);
  if (name !== "" && name === normalName(login.title)) return true;
  const codeHost = hostOf(code.title);
  return (
    codeHost !== "" &&
    valuesOf(login.fields, "url")
      .map(hostOf)
      .some((host) => host === codeHost || siteName(host) === codeHost)
  );
};

/** Equal usernames: an email without case (equal so, both are emails), anything else exactly */
const sameUser = (a: string, b: string) =>
  a.includes("@") ? a.toLowerCase() === b.toLowerCase() : a === b;

/** The same key: secret and settings, or the same text for a value that is no key */
const sameCode = (a: string, b: string) => {
  const [x, y] = [parseTotp(a), parseTotp(b)];
  if (!x.ok || !y.ok) return a === b;
  const settings = (k: typeof x.value) => [k.algorithm, k.digits, k.period, ...k.secret].join();
  return settings(x.value) === settings(y.value);
};

const stateOf = (codes: readonly string[], totp: string): CodeState => {
  if (codes.length === 0) return "free";
  return codes.some((value) => sameCode(value, totp)) ? "same" : "conflict";
};

/** The logins of the vault a code could go to, each with what it holds; none for no code */
export const codeCandidates = (
  content: EntryContent,
  logins: readonly VaultLogin[],
): CodeCandidate[] => {
  const code = codeOf(content);
  if (!code || code.account === "") return [];
  return logins
    .filter((login) => login.type === "login" && sameService(code, login))
    .filter((login) => sameUser(fieldValue(login.fields, "username"), code.account))
    .map((login) => ({ id: login.id, state: stateOf(valuesOf(login.fields, "totp"), code.totp) }));
};

/** The ID for a new field: the template's, or with `-2`, `-3` when another field has it */
const freeId = (fields: readonly Field[], base: string) => {
  const used = new Set(fields.map((f) => f.id));
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
};

/**
 * The login with the code in its field „Einmalcode“: an empty one filled, or a new one at the end.
 * A login with another code keeps it (conflict); one with this code gets it not twice (same).
 */
export const addTotp = (content: EntryContent, totp: string) => {
  const state = stateOf(valuesOf(content.fields, "totp"), totp);
  if (state !== "free") return err(state);
  const empty = content.fields.find((f) => f.kind === "totp");
  const fields = empty
    ? content.fields.map((f) => (f === empty ? { ...f, value: totp } : f))
    : [...content.fields, { ...known("totp", totp), id: freeId(content.fields, "totp") }];
  return ok({ ...content, fields });
};
