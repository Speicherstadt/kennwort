/**
 * Talking to the identity provider (OpenID Connect Discovery 1.0, Core 1.0 §3.1, RFC 7636): its
 * configuration, its keys and the exchange of a code for an ID token. The configuration must name
 * exactly the configured issuer (Discovery §4.3), its addresses must use TLS unless the provider
 * runs on this machine, and the keys are fetched anew at most once a minute.
 */
import { z } from "zod";
import { type Jwks, Jwks as JwksWire } from "./jwt.ts";
import type { OidcSettings } from "./settings.ts";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const Discovery = z.object({
  issuer: z.string(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
});
export type Discovery = z.infer<typeof Discovery>;

const TokenAnswer = z.object({ id_token: z.string().min(1).max(16_384) });

const CONFIG_TTL_MS = 60 * 60 * 1000;
const KEYS_TTL_MS = 60 * 60 * 1000;
/** A token naming an unknown key asks for the keys again, but not more often than this */
const KEYS_REFRESH_MS = 60 * 1000;
const TIMEOUT_MS = 10_000;

const secureOrLocal = (address: string) => {
  const url = URL.parse(address);
  return (
    url !== null &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  );
};

const getJson = async (fetch: Fetch, url: string) => {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok ? ((await response.json()) as unknown) : undefined;
  } catch {
    return undefined;
  }
};

export type Provider = ReturnType<typeof createProvider>;

export const createProvider = (settings: OidcSettings, fetch: Fetch, now: () => number) => {
  let config: { value: Discovery; at: number } | undefined;
  let keys: { value: Jwks; at: number } | undefined;

  const discovery = async (): Promise<Discovery | undefined> => {
    if (config && now() - config.at < CONFIG_TTL_MS) return config.value;
    const url = `${settings.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
    const parsed = Discovery.safeParse(await getJson(fetch, url));
    if (!parsed.success || parsed.data.issuer !== settings.issuer) return undefined;
    const { authorization_endpoint, token_endpoint, jwks_uri } = parsed.data;
    if (![authorization_endpoint, token_endpoint, jwks_uri].every(secureOrLocal)) return undefined;
    config = { value: parsed.data, at: now() };
    return parsed.data;
  };

  /** The provider's keys; `fresh` asks again unless that happened within the last minute */
  const jwks = async (fresh: boolean): Promise<Jwks | undefined> => {
    const age = keys ? now() - keys.at : Number.POSITIVE_INFINITY;
    if (keys && (fresh ? age < KEYS_REFRESH_MS : age < KEYS_TTL_MS)) return keys.value;
    const found = await discovery();
    if (!found) return keys?.value;
    const parsed = JwksWire.safeParse(await getJson(fetch, found.jwks_uri));
    if (parsed.success) keys = { value: parsed.data, at: now() };
    return keys?.value;
  };

  /** The address the browser goes to, with state, nonce and the PKCE challenge (S256) */
  const authorizationUrl = async (params: {
    redirectUri: string;
    state: string;
    nonce: string;
    challenge: string;
  }) => {
    const found = await discovery();
    if (!found) return undefined;
    const url = new URL(found.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", settings.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("scope", settings.scopes);
    url.searchParams.set("state", params.state);
    url.searchParams.set("nonce", params.nonce);
    url.searchParams.set("code_challenge", params.challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  };

  /** The code for an ID token (§3.1.3.1), with client_secret_basic for a confidential client */
  const exchange = async (code: string, verifier: string, redirectUri: string) => {
    const found = await discovery();
    if (!found) return undefined;
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      client_id: settings.clientId,
    });
    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };
    if (settings.clientSecret)
      headers.authorization = `Basic ${btoa(
        `${encodeURIComponent(settings.clientId)}:${encodeURIComponent(settings.clientSecret)}`,
      )}`;
    try {
      const response = await fetch(found.token_endpoint, {
        method: "POST",
        headers,
        body: form.toString(),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const parsed = TokenAnswer.safeParse(await response.json());
      return parsed.success ? parsed.data.id_token : undefined;
    } catch {
      return undefined;
    }
  };

  return { settings, discovery, jwks, authorizationUrl, exchange };
};
