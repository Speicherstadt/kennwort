/**
 * The server's own paths, /api and /auth, which the service worker never caches (P-16). A request
 * from the app goes to the server as it is. A navigation there is different: whatever document the
 * server answers would run at the app's origin, unchecked, with access to its storage and its
 * caches. So a navigation there gets redirects as they are, which sign-in flows rely on, and any
 * other answer only as inert text.
 */
export const isServerPath = (path: string) =>
  ["/api", "/auth"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

export const isServerNavigation = (origin: string, url: string, mode: RequestMode) => {
  const parsed = new URL(url);
  return mode === "navigate" && parsed.origin === origin && isServerPath(parsed.pathname);
};

const isRedirect = (response: Response) =>
  response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400);

/** Statuses whose response may carry no body */
const BODILESS = [204, 205, 304];

/**
 * The server's answer to a navigation as the browser may show it: a redirect stays a redirect,
 * anything else becomes plain text in a sandbox, so no script, SVG or HTML of the server runs
 */
export const asInertDocument = (response: Response): Response =>
  isRedirect(response)
    ? response
    : new Response(BODILESS.includes(response.status) ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-security-policy": "sandbox",
          "x-content-type-options": "nosniff",
        },
      });
