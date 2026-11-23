/**
 * The built web app (apps/web/dist) from the server itself, when KENNWORT_WEB_ROOT names it: one
 * origin for the app and its server, and the app's security headers on every file, set here
 * instead of in each reverse proxy (docs/sicherheitsdesign.md, P-16). Every path that is no file
 * and looks like a page gets index.html, the way the app's router expects; the service worker
 * takes over from there.
 */
import { realpathSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { appHeaders } from "@kennwort/core/headers";
import type { Context } from "hono";

/** Explicit types: with nosniff the browser takes them as they are */
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".sig": "text/plain; charset=utf-8",
};

/** The server's own paths answer for themselves, unknown ones too, as JSON */
const isServerPath = (path: string) =>
  ["/api", "/auth", "/health"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/** Vite names these after their content, so they never change under their name */
const IMMUTABLE = "public, max-age=31536000, immutable";

const decoded = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return undefined;
  }
};

/** The file itself, links resolved; undefined for anything that is not a file */
const realFile = (file: string) => {
  try {
    const real = realpathSync(file);
    return statSync(real).isFile() ? real : undefined;
  } catch {
    return undefined;
  }
};

const realRoot = (root: string) => {
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
};

/** A file of the build for the path: never above the root, not through a link, never a dotfile */
const fileFor = (root: string, path: string) => {
  const hidden = path.split("/").some((segment) => segment.startsWith("."));
  const file = hidden ? undefined : realFile(resolve(root, `.${path}`));
  return file?.startsWith(`${root}${sep}`) ? file : undefined;
};

/** A page of the app: its last segment has no file extension (/entries, /s/<id>) */
const isPage = (path: string) => !(path.split("/").at(-1) ?? "").includes(".");

const answer = (file: string, cache: string, secure: boolean) =>
  new Response(Bun.file(file), {
    headers: {
      ...appHeaders({ secure }),
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": cache,
    },
  });

/** The handler for GET and HEAD of everything the server's own routes do not answer */
export const webFiles = (webRoot: string, secure: boolean) => {
  const root = realRoot(resolve(webRoot));
  return (c: Context) => {
    const raw = new URL(c.req.url).pathname;
    const path = decoded(raw);
    if (path === undefined || isServerPath(raw) || isServerPath(path)) return c.notFound();
    const file = fileFor(root, path);
    if (file) {
      const immutable = file.startsWith(`${root}${sep}assets${sep}`);
      return answer(file, immutable ? IMMUTABLE : "no-cache", secure);
    }
    const index = isPage(path) ? fileFor(root, "/index.html") : undefined;
    return index ? answer(index, "no-cache", secure) : c.notFound();
  };
};
