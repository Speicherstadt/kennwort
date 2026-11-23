/**
 * The demo's fetch (K-706): every call the app makes to its server is answered by the stand-in in
 * this tab, and nothing ever goes out. An address outside /api and /auth fails like a network
 * error instead of reaching the network; the demo page's CSP (connect-src 'none') forbids it too.
 */

import { route } from "./demo-routes.ts";
import type { DemoStore } from "./demo-store.ts";

const pathOf = (input: RequestInfo | URL) => {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(href, "https://demo.invalid").pathname;
};

const bearer = (headers: Headers) =>
  headers.get("authorization")?.replace(/^Bearer /, "") || undefined;

const bodyOf = (init: RequestInit | undefined): Record<string, unknown> => {
  if (typeof init?.body !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(init.body);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/**
 * The live stream (sync/http.ts watchVault, notifications): ready at once, then open until the app
 * stops it. A single tab is the only device, so nothing changes elsewhere to report.
 */
const openStream = (signal: AbortSignal | null | undefined) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode("event: ready\ndata: {}\n\n"));
        signal?.addEventListener("abort", () => controller.close(), { once: true });
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

export const demoFetch =
  (store: DemoStore): typeof fetch =>
  async (input, init) => {
    const path = pathOf(input);
    if (!/^\/(api|auth)\//.test(path)) throw new TypeError("demo: no network"); // i18n-ignore
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    if (method === "GET" && path.endsWith("/events")) return openStream(init?.signal);
    const { status, json } = route(store, method, path, bodyOf(init), bearer(headers));
    return new Response(JSON.stringify(json ?? {}), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
