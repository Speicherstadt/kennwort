/**
 * fetch against the company's server for a client that does not run on the server's own origin:
 * the extension (K-402) and the CLI (K-606). Every path of the web app's API is resolved against
 * the connected server; a request to any other origin is refused, so nothing the client sends can
 * leave for another host.
 */
export type Send = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const target = (input: RequestInfo | URL, server: string) =>
  input instanceof Request ? new URL(input.url) : new URL(String(input), server);

/** fetch against one server's origin, and only that one */
export const serverFetch = (server: string, send: Send): typeof fetch => {
  const fetchFromServer: Send = async (input, init) => {
    const url = target(input, server);
    if (url.origin !== server) throw new TypeError(`not the connected server: ${url.origin}`); // i18n-ignore
    return send(input instanceof Request ? input : url, init);
  };
  // The API wants the platform's fetch; Bun's type adds `preconnect`, which nothing here calls
  return fetchFromServer as typeof fetch;
};
