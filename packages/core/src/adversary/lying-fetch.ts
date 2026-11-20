/**
 * The lying server on the wire: a fetch that hands every JSON answer of the real server to a
 * rewrite first. The same client code that talks to apps/server then meets the attack over HTTP.
 */
export type Rewrite = (url: string, method: string, body: unknown) => unknown;

const urlOf = (input: string | URL | Request) =>
  input instanceof Request ? input.url : String(input);

export const lyingFetch =
  (real: typeof fetch, rewrite: Rewrite): typeof fetch =>
  async (input, init) => {
    const response = await real(input, init);
    if (!response.headers.get("content-type")?.includes("application/json")) return response;
    const body = rewrite(urlOf(input), init?.method ?? "GET", await response.json());
    return Response.json(body, { status: response.status });
  };
