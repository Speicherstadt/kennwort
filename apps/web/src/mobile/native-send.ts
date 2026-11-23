/**
 * How the web app reaches its server inside the mobile app (docs/plan.md, Entscheidungen, "Server
 * der App"). The app is served from https://tauri.localhost and its CSP keeps `connect-src 'self'`,
 * so the webview never connects to the server itself: each call goes to the Rust command
 * `server_fetch` with only its method, path, headers and body. Rust builds the address on the one
 * origin stored at the first start, checks it and sends it with Android's own HTTP client, which
 * follows no redirect (apps/mobile/src-tauri: server.rs, bridge.rs, ServerPlugin.kt). Wrapped in
 * serverFetch (packages/client), so the webview side refuses other origins and redirects as well.
 */
import type { Send } from "@kennwort/client/session/server-fetch.ts";
import type { OpenStream } from "./native-stream.ts";

/** Tauri's IPC as @tauri-apps/api/core calls it, without the package: one function */
export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type NativeAnswer = { status: number; contentType?: string | null; body: string };

/** The IPC when the page runs inside the Tauri shell, else nothing */
export const tauriInvoke = (scope: object = globalThis): Invoke | undefined =>
  (scope as { __TAURI_INTERNALS__?: { invoke?: Invoke } }).__TAURI_INTERNALS__?.invoke;

/** Statuses whose Response may carry no body (Fetch standard, "null body status") */
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

const bodyOf = (body: BodyInit | null | undefined): string | null => {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return body;
  // The API sends JSON text only; anything else would need its own encoding over the IPC
  throw new TypeError("only text bodies reach the server"); // i18n-ignore
};

const refused = () => new TypeError("the server cannot be reached"); // i18n-ignore

/**
 * fetch through the Rust side to the stored origin; to be wrapped in serverFetch(server, …). A live
 * stream goes to `openStream` (native-stream.ts, K-708); without it, none is opened
 */
export const nativeSend =
  (server: string, invoke: Invoke, openStream?: OpenStream): Send =>
  async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request ? request.url : String(input));
    if (url.origin !== server) throw new TypeError(`not the connected server: ${url.origin}`); // i18n-ignore
    // Lower case as the Fetch standard iterates them; not every test DOM does, Rust expects it
    const headers = [...new Headers(init?.headers ?? request?.headers)].map(
      ([name, value]) => [name.toLowerCase(), value] as const,
    );
    // A live stream needs a socket the request IPC does not give: a channel of its own carries it
    if (headers.some(([name, value]) => name === "accept" && value.includes("text/event-stream"))) {
      if (!openStream) throw new TypeError("no live stream in the app"); // i18n-ignore
      return openStream(url.pathname + url.search, headers, init?.signal ?? request?.signal);
    }
    const answer = await invoke<NativeAnswer>("server_fetch", {
      request: {
        method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
        path: url.pathname + url.search,
        headers,
        body: bodyOf(init?.body),
      },
    }).catch(() => {
      throw refused();
    });
    return new Response(NULL_BODY.has(answer.status) ? null : answer.body, {
      status: answer.status,
      headers: answer.contentType ? { "content-type": answer.contentType } : {},
    });
  };

export type ServerSetupError =
  | "invalid-server"
  | "insecure-server"
  | "storage-failed"
  | "unexpected";

const setupErrors = new Set<string>(["invalid-server", "insecure-server", "storage-failed"]);

/** The origin stored at the first start, and storing it (Rust checks it again, server.rs) */
export const appServer = (invoke: Invoke) => ({
  stored: () => invoke<string | null>("server_get").catch(() => null),
  store: (typed: string) =>
    invoke<string>("server_set", { typed }).then(
      (origin) => ({ ok: true, value: origin }) as const,
      (code: unknown) =>
        ({
          ok: false,
          error: (setupErrors.has(String(code)) ? code : "unexpected") as ServerSetupError,
        }) as const,
    ),
});
export type AppServer = ReturnType<typeof appServer>;
