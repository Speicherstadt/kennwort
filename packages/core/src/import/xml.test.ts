import { describe, expect, it } from "vitest";
import { child, children, childText, decodeEntities, parseXml, type XmlElement } from "./xml.ts";

/** An element as plain data: name, attributes, text and children */
type Plain = {
  name: string;
  attributes?: Record<string, string>;
  text?: string;
  children?: Plain[];
};
const plain = (node: XmlElement): Plain => ({
  name: node.name,
  ...(node.attributes.size > 0 && { attributes: Object.fromEntries(node.attributes) }),
  ...(node.text !== "" && { text: node.text }),
  ...(node.children.length > 0 && { children: node.children.map(plain) }),
});
const tree = (text: string) => {
  const result = parseXml(text);
  return result.ok ? plain(result.value) : result.error;
};

describe("XML reader (K-502)", () => {
  it("reads elements, attributes in both quotes, text and empty elements", () => {
    expect(tree(`<?xml version="1.0"?>\n<a x="1" y = '2'><b>t</b><c/><d k="v" /></a>\n`)).toEqual({
      name: "a",
      attributes: { x: "1", y: "2" },
      children: [{ name: "b", text: "t" }, { name: "c" }, { name: "d", attributes: { k: "v" } }],
    });
  });

  it("keeps an element's own text around its children and reads CDATA as text", () => {
    expect(tree("<a>x<b/>y<![CDATA[<z>&amp;]]></a>")).toEqual({
      name: "a",
      text: "xy<z>&amp;",
      children: [{ name: "b" }],
    });
  });

  it("skips comments and processing instructions anywhere", () => {
    expect(tree("<!-- vor --><a><!-- <b/> --><?pi x?>t</a><!-- nach -->")).toEqual({
      name: "a",
      text: "t",
    });
  });

  it("replaces the named and numeric entities, in text and attributes", () => {
    expect(tree(`<a v="&lt;&quot;&#65;">&gt;&amp;&apos;&#x1F525;&#228;</a>`)).toEqual({
      name: "a",
      attributes: { v: '<"A' },
      text: ">&'🔥ä",
    });
  });

  it("leaves unknown and out-of-range entities as written", () => {
    expect(decodeEntities("&nbsp;&#x110000;&#99999999;&#x;&amp")).toBe(
      "&nbsp;&#x110000;&#99999999;&#x;&amp",
    );
    expect(decodeEntities("&#x10FFFF;&#1114111;")).toBe("\u{10FFFF}\u{10FFFF}");
  });

  it("reads empty attribute values and spaces before the end of a tag", () => {
    expect(tree(`<a x=""  y=''\n\tz = "1" ><b k='&amp;' /></a>`)).toEqual({
      name: "a",
      attributes: { x: "", y: "", z: "1" },
      children: [{ name: "b", attributes: { k: "&" } }],
    });
  });

  it("allows a close tag with spaces before its bracket", () => {
    expect(tree("<a>t</a  >")).toEqual({ name: "a", text: "t" });
  });

  it("refuses everything malformed", () => {
    const malformed = [
      "",
      "text",
      "<a>",
      "<a></b>",
      "</a>",
      "<a></a><b></b>",
      "<a></a>text",
      "<a/>x",
      "<!DOCTYPE a><a/>",
      "<a",
      "<a x>",
      "<a x=1>",
      "<a x='1>",
      "<a x='1'",
      "<a x='1'/ >",
      "<a $='1'>",
      "<1/>",
      "<a><!-- offen</a>",
      "<a><?pi</a>",
      "<a><![CDATA[offen</a>",
      "<a></a",
      "<a></>",
      "<a ='1'/>",
      `<a x"'1'/>`,
      "<a x=a b=a/>",
      "< x='1'/>",
      "<a x='1'y='2'/>",
      "<a/ ></a>",
      "<a/><b/>",
      "<a><b></c></b></a>",
      "<a><1/></a>",
      "<a><b x></a>",
    ];
    for (const text of malformed) expect([text, tree(text)]).toEqual([text, "bad-xml"]);
  });

  it("finds children by name", () => {
    const result = parseXml("<a><b>1</b><c/><b>2</b></a>");
    if (!result.ok) throw new Error("xml");
    const root = result.value;
    expect(child(root, "b")?.text).toBe("1");
    expect(child(undefined, "b")).toBeUndefined();
    expect(children(root, "b").map((b) => b.text)).toEqual(["1", "2"]);
    expect(children(undefined, "b")).toEqual([]);
    expect([childText(root, "b"), childText(root, "x"), childText(undefined, "b")]).toEqual([
      "1",
      "",
      "",
    ]);
  });
});
