import { describe, expect, it } from "vitest";
import { unprotect } from "./kdbx-xml.ts";
import { parseXml, type XmlElement } from "./xml.ts";

const encoder = new TextEncoder();
/** A stream of the bytes 1, 2, 3, … that records how much was asked */
const counting = () => {
  const asked: number[] = [];
  return {
    asked,
    stream: (length: number) => {
      asked.push(length);
      return Uint8Array.from({ length }, (_, i) => i + 1);
    },
  };
};
/** The value XORed with the stream from `offset`, as Base64 */
const hide = (value: string, offset: number) =>
  Buffer.from(encoder.encode(value).map((b, i) => b ^ (offset + i + 1))).toString("base64");
const xml = (text: string) => {
  const parsed = parseXml(text);
  if (!parsed.ok) throw new Error(text);
  return parsed.value;
};
const values = (root: XmlElement) => {
  const out: [string, string | undefined, string | undefined][] = [];
  const pending = [root];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (node.name === "Value")
      out.push([
        node.text,
        node.attributes.get("Protected"),
        node.attributes.get("ProtectInMemory"),
      ]);
    pending.push(...[...node.children].reverse());
  }
  return out;
};

describe("protected values", () => {
  it("reveals them in document order, nested ones included, with one stream", () => {
    const root = xml(
      `<A><Value Protected="True">${hide("Jonas", 0)}</Value>` +
        `<B><Value Protected="1">${hide("Änna", 5)}</Value><Value>offen</Value></B>` +
        `<Value Protected="true">${hide("", 10)}</Value>` +
        `<Value Protected="False">bleibt</Value>` +
        `<Value Protected="TRUE">${hide("Max", 10)}</Value></A>`,
    );
    const { asked, stream } = counting();
    expect(unprotect(root, stream)).toEqual({ ok: true, value: root });
    expect(asked).toEqual([13]);
    expect(values(root)).toEqual([
      ["Jonas", undefined, "True"],
      ["Änna", undefined, "True"],
      ["offen", undefined, undefined],
      ["", undefined, "True"],
      ["bleibt", "False", undefined],
      ["Max", undefined, "True"],
    ]);
  });

  it("ignores whitespace around the Base64", () => {
    const root = xml(`<Value Protected="True">\n  ${hide("Sandra", 0)}\n</Value>`);
    expect(unprotect(root, counting().stream).ok).toBe(true);
    expect(root.text).toBe("Sandra");
  });

  it("refuses a value that is no Base64", () => {
    const root = xml(
      `<A><Value Protected="True">${hide("ok", 0)}</Value><Value Protected="True">a</Value></A>`,
    );
    expect(unprotect(root, counting().stream)).toEqual({ ok: false, error: "bad-kdbx" });
  });

  it("handles a document with very many elements without recursion", () => {
    const many = `<A>${"<Value>x</Value>".repeat(200_000)}</A>`;
    expect(unprotect(xml(many), counting().stream).ok).toBe(true);
  });
});
