import { describe, expect, it } from "vitest";
import { lyingFetch } from "./lying-fetch.ts";

describe("lyingFetch", () => {
  it("rewrites JSON answers with URL and method, keeps the status, and leaves other answers alone", async () => {
    const seen: unknown[] = [];
    const real = (async (input: string | URL | Request) =>
      String(input instanceof Request ? input.url : input).endsWith("/text")
        ? new Response("plain", { status: 202, headers: { "content-type": "text/plain" } })
        : Response.json({ n: 1 }, { status: 409 })) as typeof fetch;
    const lying = lyingFetch(real, (url, method, body) => {
      seen.push([url, method, body]);
      return { n: 2 };
    });
    const json = await lying("https://k.test/a", { method: "PUT" });
    expect([json.status, await json.json()]).toEqual([409, { n: 2 }]);
    await lying(new Request("https://k.test/b"));
    await lying(new URL("https://k.test/c"));
    expect(seen).toEqual([
      ["https://k.test/a", "PUT", { n: 1 }],
      ["https://k.test/b", "GET", { n: 1 }],
      ["https://k.test/c", "GET", { n: 1 }],
    ]);
    const text = await lying("https://k.test/text");
    expect([text.status, await text.text()]).toEqual([202, "plain"]);
    const empty = lyingFetch(
      (async () => new Response(null, { status: 204 })) as unknown as typeof fetch,
      () => 0,
    );
    expect((await empty("https://k.test/")).status).toBe(204);
    const bare = lyingFetch((async () => new Response("x")) as unknown as typeof fetch, () => 0);
    expect(await (await bare("https://k.test/")).text()).toBe("x");
  });
});
