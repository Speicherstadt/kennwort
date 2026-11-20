import { describe, expect, it } from "vitest";
import { callArguments, solid2Findings } from "./solid2-rules.ts";

const rules = (source: string) =>
  solid2Findings(source).map((f) => `${f.line}: ${f.rule.split(":")[0]}`);

describe("solid2Findings (docs/solid-2.0/MIGRATION.md)", () => {
  it("finds names Solid 2.0 removed, only where they come from Solid", () => {
    const source = [
      'import { createResource, mergeProps, onMount, Show } from "solid-js";',
      'import { Suspense } from "@solidjs/web";',
      'import { unwrap } from "@kennwort/crypto";',
      "const opened = unwrap(key);",
    ].join("\n");
    expect(rules(source)).toEqual([
      "1: createResource is gone in Solid 2.0",
      "1: mergeProps is gone in Solid 2.0",
      "1: onMount is gone in Solid 2.0",
      "2: Suspense is gone in Solid 2.0",
    ]);
    expect(rules('import { onError } from "hono";\napp.onError(handle);')).toEqual([]);
    expect(rules('import { type Accessor, createSignal as signal } from "solid-js";')).toEqual([]);
    expect(rules('import { on as listen } from "solid-js";')).toEqual([
      "1: on is gone in Solid 2.0",
    ]);
  });

  it("finds 1.x subpath imports, classList, removed namespaces, Provider, lowercase handlers and @once", () => {
    const source = [
      'import { render } from "solid-js/web";',
      'import { createStore } from "solid-js/store";',
      "<div classList={{ active: on() }} />",
      "<input use:model={value} />",
      "<button on:click={go} />",
      "<Theme.Provider value='dark'>",
      "<button onclick={go} />",
      "<p>{/*@once*/ props.title}</p>",
    ].join("\n");
    expect(rules(source)).toEqual([
      "1: 1.x subpath import",
      "2: 1.x subpath import",
      "3: classList",
      "4: removed JSX namespace (use",
      "5: removed JSX namespace (use",
      "6: Context.Provider",
      "7: lowercase on* on an element is an attribute in 2.0",
      "8: /*@once*/ is gone",
    ]);
    expect(rules('<button onClick={go} class={["a", { b: on() }]} />')).toEqual([]);
    expect(rules("<Menu onselect={pick} />")).toEqual([]);
  });

  it("finds a one-function createEffect and a createMemo with an initial value", () => {
    const head = 'import { createEffect, createMemo, createRenderEffect } from "solid-js";\n';
    expect(rules(`${head}createEffect(() => { el.title = name(); });`)).toEqual([
      "2: createEffect with one function (1.x)",
    ]);
    expect(rules(`${head}createRenderEffect(() => log(count()));`)).toEqual([
      "2: createRenderEffect with one function (1.x)",
    ]);
    expect(rules(`${head}const d = createMemo((prev) => count() * 2, 0);`)).toEqual([
      "2: createMemo's second argument is options now, not an initial value",
    ]);
    expect(
      rules(
        `${head}createEffect(\n  () => name(),\n  (v) => { el.title = v; },\n);\nconst m = createMemo(() => a(), { name: "m" });\nconst n = createMemo<number>(() => b());`,
      ),
    ).toEqual([]);
    // Without the import it is someone else's createEffect
    expect(rules("createEffect(() => 1);")).toEqual([]);
  });

  it("finds onCleanup inside a ref callback, not beside it", () => {
    expect(rules("<div ref={(el) => { el.focus(); onCleanup(() => el.blur()); }} />")).toEqual([
      "1: onCleanup in a ref callback",
    ]);
    expect(rules("onCleanup(stop);\n<div ref={(el) => { video = el; }} />")).toEqual([]);
  });
});

describe("solid2Findings, as the formatter lays the code out", () => {
  it("finds a lowercase handler on an element whose attributes stand on their own lines", () => {
    const source = [
      "<button",
      '  type="button"',
      '  class={cn(open() && "bg-accent")}',
      "  onclick={() => go(1)}",
      ">",
      "<Menu",
      "  onselect={pick}",
      "/>",
      "const sizes = new Map<string, number>();",
    ].join("\n");
    expect(rules(source)).toEqual(["4: lowercase on* on an element is an attribute in 2.0"]);
  });

  it("finds onCleanup in a ref callback with a typed parameter", () => {
    expect(
      rules("<div\n  ref={(el: HTMLDivElement) => {\n    onCleanup(() => el.blur());\n  }}\n/>"),
    ).toEqual(["2: onCleanup in a ref callback"]);
    expect(rules("<div ref={function (el) { onCleanup(stop); }} />")).toEqual([
      "1: onCleanup in a ref callback",
    ]);
  });

  it("follows Solid's names under another name or a namespace", () => {
    expect(
      rules(
        'import { createEffect as effect } from "solid-js";\neffect(() => { el.title = name(); });',
      ),
    ).toEqual(["2: createEffect with one function (1.x)"]);
    expect(
      rules(
        'import * as Solid from "solid-js";\nSolid.onMount(go);\nSolid.createEffect(() => go());\nSolid.createEffect(() => stop());',
      ),
    ).toEqual([
      "2: onMount is gone in Solid 2.0",
      "3: createEffect with one function (1.x)",
      "4: createEffect with one function (1.x)",
    ]);
  });
});

describe("callArguments", () => {
  it("splits at top-level commas only, past strings and nested brackets", () => {
    // A template literal with a placeholder, put together so no linter takes it for a mistake
    const template = ["`z,", "$", "{w}`"].join("");
    const source = `f(a(1, 2), { b: [3, 4] }, "x, y", ${template})`;
    expect(callArguments(source, 1).map((a) => a.trim())).toEqual([
      "a(1, 2)",
      "{ b: [3, 4] }",
      '"x, y"',
      template,
    ]);
    expect(callArguments("f()", 1)).toEqual([]);
    expect(callArguments('f("a\\"b", c)', 1).map((a) => a.trim())).toEqual(['"a\\"b"', "c"]);
    expect(callArguments("f(a", 1)).toEqual([]);
  });
});
