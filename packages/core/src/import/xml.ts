/**
 * Just enough XML for KeePass's export (K-502): elements, attributes, text, CDATA, comments and the
 * five named entities plus numeric ones. A document type is refused, so no entity can expand. One
 * pass with an explicit stack, no recursion and no backtracking, so no file makes it overflow or
 * hang; every way to be malformed is an error, never an exception.
 */
import type { Result } from "@kennwort/crypto";
import { err, ok } from "../result.ts";

export type XmlElement = {
  name: string;
  attributes: Map<string, string>;
  children: XmlElement[];
  /** The element's own text, CDATA included, its children's left out */
  text: string;
};

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const MAX_CODE_POINT = 0x10ffff;

const entity = (whole: string, body: string): string => {
  if (!body.startsWith("#")) return NAMED[body] ?? whole;
  const code =
    body[1] === "x" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
  return code <= MAX_CODE_POINT ? String.fromCodePoint(code) : whole;
};

/** Text with its entities replaced; one that is unknown or out of range stays as written */
export const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-fA-F]{1,8}|#[0-9]{1,8}|lt|gt|amp|quot|apos);/g, entity);

const NAME = /[A-Za-z_][\w.:-]*/y;
const SPACE = /\s*/y;

type Cursor = { text: string; at: number };

/** What the sticky pattern matches at the cursor, moving past it */
const take = (cursor: Cursor, pattern: RegExp): RegExpExecArray | null => {
  pattern.lastIndex = cursor.at;
  const match = pattern.exec(cursor.text);
  if (match) cursor.at = pattern.lastIndex;
  return match;
};

/** One attribute after a space: name, `=`, value in either quotes (no part can backtrack) */
const ATTRIBUTE = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;

/** The attributes as far as they go; the tag's end is checked by the caller */
const attributes = (cursor: Cursor): Map<string, string> => {
  const found = new Map<string, string>();
  for (let match = take(cursor, ATTRIBUTE); match; match = take(cursor, ATTRIBUTE)) {
    found.set(String(match[1]), decodeEntities(match[2] ?? String(match[3])));
  }
  take(cursor, SPACE);
  return found;
};

/** Skips past `close`; false if it never comes */
const skipPast = (cursor: Cursor, close: string): boolean => {
  const end = cursor.text.indexOf(close, cursor.at);
  if (end === -1) return false;
  cursor.at = end + close.length;
  return true;
};

const element = (name: string, attrs: Map<string, string>): XmlElement => ({
  name,
  attributes: attrs,
  children: [],
  text: "",
});

type State = { cursor: Cursor; stack: XmlElement[]; root: XmlElement | undefined };

const addText = (state: State, text: string) => {
  const parent = state.stack.at(-1);
  if (parent) parent.text += text;
  else if (text.trim() !== "") return false;
  return true;
};

const open = (state: State): boolean => {
  const { cursor } = state;
  const name = take(cursor, NAME)?.[0];
  if (name === undefined) return false;
  const attrs = attributes(cursor);
  const closed = cursor.text.startsWith("/>", cursor.at);
  if (!closed && cursor.text[cursor.at] !== ">") return false;
  cursor.at += closed ? 2 : 1;
  const node = element(name, attrs);
  const parent = state.stack.at(-1);
  if (parent) parent.children.push(node);
  else if (state.root) return false;
  else state.root = node;
  if (!closed) state.stack.push(node);
  return true;
};

const close = (state: State): boolean => {
  const { cursor } = state;
  const name = take(cursor, NAME)?.[0];
  take(cursor, SPACE);
  if (cursor.text[cursor.at] !== ">" || state.stack.at(-1)?.name !== name) return false;
  cursor.at++;
  state.stack.pop();
  return true;
};

/** One step from a `<`: what kind of markup it starts decides */
const markup = (state: State): boolean => {
  const { cursor } = state;
  const rest = (prefix: string) => cursor.text.startsWith(prefix, cursor.at);
  if (rest("<!--")) return skipPast(cursor, "-->");
  if (rest("<?")) return skipPast(cursor, "?>");
  if (rest("<![CDATA[")) {
    const start = cursor.at + 9;
    return skipPast(cursor, "]]>") && addText(state, cursor.text.slice(start, cursor.at - 3));
  }
  cursor.at++;
  if (rest("/")) {
    cursor.at++;
    return close(state);
  }
  return open(state);
};

export const parseXml = (text: string): Result<XmlElement, "bad-xml"> => {
  const state: State = { cursor: { text, at: 0 }, stack: [], root: undefined };
  const { cursor } = state;
  while (cursor.at < text.length) {
    const next = text.indexOf("<", cursor.at);
    const end = next < 0 ? text.length : next;
    if (!addText(state, decodeEntities(text.slice(cursor.at, end)))) return err("bad-xml");
    cursor.at = end;
    if (next >= 0 && !markup(state)) return err("bad-xml");
  }
  return state.root && state.stack.length === 0 ? ok(state.root) : err("bad-xml");
};

/** The first child with this name */
export const child = (node: XmlElement | undefined, name: string): XmlElement | undefined =>
  node?.children.find((c) => c.name === name);

/** The children with this name */
export const children = (node: XmlElement | undefined, name: string): XmlElement[] =>
  node?.children.filter((c) => c.name === name) ?? [];

/** The text of the first child with this name, or empty */
export const childText = (node: XmlElement | undefined, name: string): string =>
  child(node, name)?.text ?? "";
