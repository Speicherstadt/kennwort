/**
 * The security headers of every answer from Kennwort's origin (docs/sicherheitsdesign.md, P-16,
 * "CSP und Sicherheits-Kopfzeilen"):
 * the server sends them with the web app's files and with its own answers, and the service worker
 * puts them on the verified files it serves from its caches (P-16), whose stored copies carry no
 * headers of the network. One table, so the server and the worker cannot drift apart.
 */

export type Transport = { secure: boolean };

/**
 * The web app's policy: its own origin for exactly the kinds of files it loads. No inline script
 * or style, no eval and no WASM (noble's Argon2 is plain JavaScript); Solid sets styles through
 * the CSSOM, which style-src does not govern. No frames, no plugins, no foreign <base>.
 */
const APP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // No require-trusted-types-for 'script': Solid builds every template with innerHTML on a
  // <template>, and register.ts hands a plain string to serviceWorker.register; under Trusted
  // Types the app renders nothing (tried in e2e/csp.spec.ts). A default policy letting every
  // string through would only pretend.
];

/** upgrade-insecure-requests only behind https: over http on localhost it would break every load */
export const appPolicy = ({ secure }: Transport) =>
  [...APP_DIRECTIVES, ...(secure ? ["upgrade-insecure-requests"] : [])].join("; ");

/** The server's own answers (JSON, redirects): opened as a page they run nothing, in a sandbox */
export const API_POLICY = "default-src 'none'; frame-ancestors 'none'; sandbox";

/**
 * Every feature Chromium knows denied, but the camera for the QR scan (K-306), copying to the
 * clipboard, and autoplay for the scan's muted camera video, which starts after the camera
 * permission, possibly long after the click. Passkeys are entry data here, the web app calls no
 * WebAuthn itself; unknown names would only cost a console error.
 */
const ALLOWED_FEATURES = new Set(["autoplay", "camera", "clipboard-write"]);
const FEATURES = [
  "accelerometer",
  "autoplay",
  "bluetooth",
  "browsing-topics",
  "camera",
  "clipboard-read",
  "clipboard-write",
  "display-capture",
  "encrypted-media",
  "fullscreen",
  "geolocation",
  "gyroscope",
  "hid",
  "idle-detection",
  "local-fonts",
  "magnetometer",
  "microphone",
  "midi",
  "otp-credentials",
  "payment",
  "picture-in-picture",
  "publickey-credentials-create",
  "publickey-credentials-get",
  "screen-wake-lock",
  "serial",
  "usb",
  "window-management",
  "xr-spatial-tracking",
];
export const PERMISSIONS_POLICY = FEATURES.map(
  (feature) => `${feature}=(${ALLOWED_FEATURES.has(feature) ? "self" : ""})`,
).join(", ");

/** A year, without includeSubDomains: other hosts under the operator's domain may lack https */
export const HSTS = "max-age=31536000";

const common = (policy: string, hsts: boolean): Record<string, string> => ({
  "content-security-policy": policy,
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "x-frame-options": "DENY",
  "permissions-policy": PERMISSIONS_POLICY,
  ...(hsts ? { "strict-transport-security": HSTS } : {}),
});

/**
 * The web app's files. HSTS only behind https, and never from the service worker: browsers take
 * it only from the network.
 */
export const appHeaders = ({ secure, hsts = secure }: Transport & { hsts?: boolean }) =>
  common(appPolicy({ secure }), secure && hsts);

/** The server's own answers */
export const apiHeaders = ({ secure }: Transport) => common(API_POLICY, secure);
