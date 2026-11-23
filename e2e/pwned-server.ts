// Serves the stand-in for Pwned Passwords to the e2e server (e2e/pwned.ts): GET /range/<prefix>,
// only with `Add-Padding: true`, as the real service is asked
import { PWNED_PORT, rangeOf } from "./pwned.ts";

Bun.serve({
  port: PWNED_PORT,
  fetch: (request) => {
    const prefix = /^\/range\/([0-9A-F]{5})$/.exec(new URL(request.url).pathname)?.[1];
    if (!prefix) return new Response("not found", { status: 404 });
    if (request.headers.get("add-padding") !== "true")
      return new Response("padding expected", { status: 400 });
    return new Response(rangeOf(prefix), { headers: { "content-type": "text/plain" } });
  },
});
