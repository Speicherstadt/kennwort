/**
 * The pages of the engine tests (playwright.engines.config.ts, K-407), on two ports:
 *
 * - WEB_PORT: the built web app, where a test sets up its company as a person does;
 * - EXTENSION_PORT: the built extension's own pages (the build each request names in
 *   `x-kennwort-build`: chrome, firefox or safari) and the fill harness (apps/extension/harness).
 *
 * Both pass /api and /auth on to the e2e server, the way Vite does for the web app, so the popup
 * reaches the server from its own origin. Its assets use paths from the root, hence a port each.
 */
import { existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { HARNESS_HTML } from "./harness-pages.ts";

export const WEB_PORT = 5177;
export const EXTENSION_PORT = 5178;
export const SERVER_PORT = 28110;

const root = join(import.meta.dirname, "..", "..");
const BUILDS = new Set(["chrome", "firefox", "safari"]);

/** A file under `dir`, never above it */
const fileIn = (dir: string, path: string) => {
  const file = normalize(join(dir, decodeURIComponent(path)));
  return file.startsWith(dir) && existsSync(file) && statSync(file).isFile() ? file : undefined;
};

const proxy = async (request: Request, url: URL) => {
  const headers = new Headers(request.headers);
  headers.delete("host");
  const answer = await fetch(`http://localhost:${SERVER_PORT}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer(),
    redirect: "manual",
  });
  // Bun's fetch has already decoded the body
  const out = new Headers(answer.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(answer.body, { status: answer.status, headers: out });
};

const isApi = (path: string) => /^\/(api|auth)(\/|$)/.test(path);

const harnessScript = async () => {
  const built = await Bun.build({
    entrypoints: [join(root, "apps", "extension", "harness", "engine-harness.ts")],
    target: "browser",
    format: "esm",
  });
  if (!built.success) throw new AggregateError(built.logs, "harness build failed");
  return (built.outputs[0] as Blob).text();
};
let script: Promise<string> | undefined;

const extensionPage = async (request: Request, url: URL) => {
  if (url.pathname === "/harness/page.js") {
    script ??= harnessScript();
    return new Response(await script, { headers: { "content-type": "text/javascript" } });
  }
  const harness = HARNESS_HTML[url.pathname];
  if (harness) return new Response(harness, { headers: { "content-type": "text/html" } });
  const build = request.headers.get("x-kennwort-build") ?? "chrome";
  if (!BUILDS.has(build)) return new Response("unknown build", { status: 400 });
  const file = fileIn(join(root, "apps", "extension", "dist", build), url.pathname);
  return file ? new Response(Bun.file(file)) : new Response("not found", { status: 404 });
};

const webPage = (url: URL) => {
  const dist = join(root, "apps", "web", "dist");
  const file = fileIn(dist, url.pathname) ?? join(dist, "index.html");
  return new Response(Bun.file(file));
};

type Handler = (request: Request, url: URL) => Response | Promise<Response>;

const listen = (port: number, page: Handler, hostname: string) =>
  Bun.serve({
    port,
    hostname,
    fetch: (request) => {
      const url = new URL(request.url);
      return isApi(url.pathname) ? proxy(request, url) : page(request, url);
    },
  });

// localhost and 127.0.0.1 (the foreign frame's origin) both: dual stack where there is IPv6
const serve = (port: number, page: Handler) => {
  try {
    return listen(port, page, "::");
  } catch {
    return listen(port, page, "0.0.0.0");
  }
};

if (import.meta.main) {
  serve(WEB_PORT, (_request, url) => webPage(url));
  serve(EXTENSION_PORT, extensionPage);
  console.log(`engine pages on ${WEB_PORT} and ${EXTENSION_PORT}`);
}
