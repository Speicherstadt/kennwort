/**
 * Serves the demo build (K-706) the way GitHub Pages does: static files under /demo/, no API and
 * no headers of the app's server. Every request is static by construction, so e2e/demo.spec.ts
 * can tell any attempt to reach a server apart. Run from the repository root.
 */
import { join, normalize } from "node:path";
import { DEMO_PORT } from "./demo.ts";

const root = "apps/web/dist-demo";
const missing = () => new Response("not found", { status: 404 });

Bun.serve({
  port: DEMO_PORT,
  fetch: async (request) => {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/demo/")) return missing();
    const relative = normalize(pathname.slice("/demo/".length) || "index.html");
    if (relative.startsWith("..")) return missing();
    const file = Bun.file(join(root, relative));
    return (await file.exists()) ? new Response(file) : missing();
  },
});
