/**
 * The address a rate limit counts (review of K-203): the socket's peer, which a client cannot
 * choose. Behind a reverse proxy (Caddy) every request comes from the proxy, so there the address
 * the proxy appended last to X-Forwarded-For counts; anything before it the client may have sent.
 */
export type ClientEnv = { address?: string } | undefined;
export type ClientAddress = (request: Request, env: ClientEnv) => string;

export const clientAddress =
  (behindProxy: boolean): ClientAddress =>
  (request, env) => {
    const forwarded = behindProxy
      ? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
      : undefined;
    return forwarded || env?.address || "unknown";
  };
