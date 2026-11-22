/**
 * CORS for the browser extension (K-402): its popup runs under its own origin
 * (chrome-extension://<id>, moz-extension://<uuid>, safari-web-extension://<uuid>) and reaches the company's server across
 * origins. Only such an origin gets CORS headers, only for the paths the popup calls (the API and
 * the sign-in key), and never with credentials: every call carries a bearer token, so opening the
 * API to an extension's origin hands it nothing it does not already hold. Web pages get no CORS
 * headers at all; the web app runs on the server's own origin.
 */
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// Chrome and Edge: 32 letters a-p; Firefox: a random UUID per installation, in small letters
const EXTENSION_ORIGIN = new RegExp(`^(chrome-extension://[a-p]{32}|moz-extension://${UUID})$`);
// Safari (K-407): a random UUID that changes with every launch; WebKit writes it in capitals,
// either case is taken (MDN, web_accessible_resources)
const SAFARI_ORIGIN = new RegExp(`^safari-web-extension://${UUID}$`, "i");

export const isExtensionOrigin = (origin: string) =>
  EXTENSION_ORIGIN.test(origin) || SAFARI_ORIGIN.test(origin);

const PATHS = [/^\/api(\/|$)/, /^\/auth\/login-key\//];

const allow = cors({
  origin: (origin) => (isExtensionOrigin(origin) ? origin : null),
  allowMethods: ["GET", "POST", "PUT", "DELETE"],
  allowHeaders: ["authorization", "content-type", "x-kennwort-device", "x-kennwort-device-name"],
  maxAge: 600,
});

export const extensionCors: MiddlewareHandler = (c, next) =>
  PATHS.some((path) => path.test(c.req.path)) ? allow(c, next) : next();
