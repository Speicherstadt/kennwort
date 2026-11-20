/**
 * The service worker activates only a signed release whose hashes hold (K-308, P-16). A static
 * server of its own serves the production build the e2e web server has built (apps/web/dist, signed
 * with the loop's test key) and switches to other versions of it on demand: one with a file changed
 * after signing, one signed with another key, and a correct one.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "apps/web/dist");
const OTHER_KEY = "22".repeat(32);

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/** A version of the build: index.html carries its name, then it is signed and maybe tampered with */
const prepare = (dir: string, name: string, how: { key?: string; tamper?: boolean } = {}) => {
  const out = join(dir, name);
  cpSync(dist, out, { recursive: true });
  const index = join(out, "index.html");
  const marked = (value: string) => `<meta name="kennwort-e2e-release" content="${value}" />`;
  writeFileSync(index, readFileSync(index, "utf8").replace("</head>", `${marked(name)}</head>`));
  const v1 = JSON.parse(readFileSync(join(dist, "release.json"), "utf8")) as { sequence: number };
  execFileSync("bun", ["apps/web/scripts/sign-release.ts", out], {
    cwd: root,
    env: {
      ...process.env,
      SOURCE_DATE_EPOCH: String(v1.sequence + 1),
      ...(how.key ? { KENNWORT_RELEASE_KEY: how.key } : {}),
    },
  });
  if (how.tamper) {
    writeFileSync(
      index,
      readFileSync(index, "utf8").replace(marked(name), marked("changed after signing")),
    );
  }
  return out;
};

/** Serves one version folder at a time, the app's page for every path that is no file */
const staticServer = async () => {
  let current = dist;
  const server: Server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    // A server that answers a navigation under /api with a page of its own, and /auth with a redirect
    if (path === "/api/page") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<script>document.title = 'server code ran'</script>");
      return;
    }
    if (path === "/auth/redirect") {
      response.writeHead(302, { location: "/entries" }).end();
      return;
    }
    if (path.startsWith("/api/") || path.startsWith("/auth/")) {
      response.writeHead(404).end();
      return;
    }
    const file = join(current, path);
    const found = existsSync(file) && statSync(file).isFile() ? file : join(current, "index.html");
    response.writeHead(200, {
      "content-type": types[extname(found)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(readFileSync(found));
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}/`,
    serve: (dir: string) => {
      current = dir;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const release = (page: Page) =>
  page.locator('meta[name="kennwort-e2e-release"]').getAttribute("content", { timeout: 1000 });

/** Asks the worker for a check, as the page does on load, and returns its answer */
const check = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => resolve(event.data);
        navigator.serviceWorker.controller?.postMessage({ type: "kennwort-check" }, [
          channel.port2,
        ]);
      }),
  );

test.use({ locale: "de-DE", serviceWorkers: "allow" });

test("the service worker activates only a signed release whose hashes hold", {
  tag: "@phone",
}, async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "kennwort-pwa-"));
  const server = await staticServer();
  try {
    const tampered = prepare(dir, "tampered", { tamper: true });
    const otherKey = prepare(dir, "other-key", { key: OTHER_KEY });
    const v2 = prepare(dir, "v2");

    await test.step("installs the signed v1", async () => {
      await page.goto(server.url);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
      expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe(
        "/manifest.webmanifest",
      );
    });

    await test.step("shows a page the server answers under /api only as inert text", async () => {
      await page.goto(`${server.url}api/page`);
      expect(await page.evaluate(() => document.contentType)).toBe("text/plain");
      expect(await page.title()).not.toBe("server code ran");
      // A redirect through /auth, as in a sign-in flow, still leads into the app
      await page.goto(`${server.url}auth/redirect`);
      await expect(page).toHaveURL(`${server.url}entries`);
      await page.goto(server.url);
    });

    await test.step("refuses a v2 with a file changed after signing", async () => {
      server.serve(tampered);
      expect(await check(page)).toEqual({ ready: false, refused: "hash" });
      const answer = await page.reload();
      expect(answer?.fromServiceWorker()).toBe(true);
      await expect(page.locator('meta[name="kennwort-e2e-release"]')).toHaveCount(0);
      // The server itself delivers the tampered page; the worker kept it out
      expect(await (await page.request.get(server.url)).text()).toContain(
        'content="changed after signing"',
      );
    });

    await test.step("refuses a v2 signed with another key", async () => {
      server.serve(otherKey);
      expect(await check(page)).toEqual({ ready: false, refused: "signature" });
      await page.reload();
      await expect(page.locator('meta[name="kennwort-e2e-release"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Neu laden" })).toHaveCount(0);
    });

    await test.step("activates a correct v2 after a reload", async () => {
      server.serve(v2);
      // The page checks on load by itself and offers the verified version
      await page.reload();
      await expect(page.getByText("Neue Version bereit")).toBeVisible();
      await expect(page.locator('meta[name="kennwort-e2e-release"]')).toHaveCount(0);
      await page.getByRole("button", { name: "Neu laden" }).click();
      await expect.poll(() => release(page)).toBe("v2");
      expect(await check(page)).toEqual({ ready: false });
    });
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
