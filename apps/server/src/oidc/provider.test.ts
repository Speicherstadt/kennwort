// K-604: the provider's configuration must name the configured issuer, use TLS, and its keys are
// fetched anew at most once a minute
import { describe, expect, it } from "vitest";
import { createProvider, type Fetch } from "./provider.ts";

const ISSUER = "https://sso.weber-haustechnik.test";
const settings = {
  issuer: ISSUER,
  clientId: "kennwort",
  clientSecret: "geheim:mit&zeichen",
  name: "Weber SSO",
  scopes: "openid profile",
};

const discovery = (over: Record<string, unknown> = {}) => ({
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  ...over,
});

const serving = (config: unknown, calls: string[] = [], token?: (init?: RequestInit) => Response) =>
  (async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.endsWith("/.well-known/openid-configuration")) return Response.json(config);
    if (url.endsWith("/jwks")) return Response.json({ keys: [] });
    if (url.endsWith("/token") && token) return token(init);
    return new Response("", { status: 404 });
  }) as Fetch;

const redirect = { redirectUri: "https://k.test/cb", state: "s", nonce: "n", challenge: "c" };

describe("createProvider", () => {
  it("refuses a configuration that names another issuer (Discovery §4.3)", async () => {
    const provider = createProvider(
      settings,
      serving(discovery({ issuer: "https://evil.test" })),
      () => 0,
    );
    expect(await provider.authorizationUrl(redirect)).toBeUndefined();
  });

  it("refuses endpoints without TLS on another machine", async () => {
    for (const over of [
      { token_endpoint: "http://sso.weber-haustechnik.test/token" },
      { jwks_uri: "http://sso.weber-haustechnik.test/jwks" },
    ]) {
      const provider = createProvider(settings, serving(discovery(over)), () => 0);
      expect(await provider.authorizationUrl(redirect)).toBeUndefined();
    }
  });

  it("keeps the configuration an hour and fetches keys anew at most once a minute", async () => {
    let time = 0;
    const calls: string[] = [];
    const provider = createProvider(settings, serving(discovery(), calls), () => time);
    await provider.jwks(false);
    await provider.jwks(true);
    expect(calls.filter((c) => c.endsWith("/jwks"))).toHaveLength(1);
    time += 61_000;
    await provider.jwks(true);
    expect(calls.filter((c) => c.endsWith("/jwks"))).toHaveLength(2);
    expect(calls.filter((c) => c.includes("openid-configuration"))).toHaveLength(1);
  });

  it("exchanges the code with the verifier and client_secret_basic, form-encoded", async () => {
    let sent: RequestInit | undefined;
    const fetch = serving(discovery(), [], (init) => {
      sent = init;
      return Response.json({ id_token: "a.b.c" });
    });
    const provider = createProvider(settings, fetch, () => 0);
    expect(await provider.exchange("code-1", "verifier-1", "https://k.test/cb")).toBe("a.b.c");
    const form = new URLSearchParams(String(sent?.body));
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      redirect_uri: "https://k.test/cb",
      code_verifier: "verifier-1",
      client_id: "kennwort",
    });
    const auth = ((sent?.headers ?? {}) as Record<string, string>).authorization ?? "";
    expect(atob(auth.replace("Basic ", ""))).toBe("kennwort:geheim%3Amit%26zeichen");
  });

  it("gives no ID token when the provider refuses the code or answers without one", async () => {
    for (const answer of [
      () => Response.json({ error: "invalid_grant" }, { status: 400 }),
      () => Response.json({ access_token: "x" }),
    ]) {
      const provider = createProvider(settings, serving(discovery(), [], answer), () => 0);
      expect(await provider.exchange("c", "v", "https://k.test/cb")).toBeUndefined();
    }
  });
});
