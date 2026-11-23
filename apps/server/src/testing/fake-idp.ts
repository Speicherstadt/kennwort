/**
 * An OpenID Connect provider for tests (K-604), in-process or served by e2e/oidc-server.ts: discovery,
 * JWKS, an authorization endpoint with a small form (who signs in, with which groups), and a token
 * endpoint that checks PKCE (RFC 7636), the client and the redirect address and takes each code once.
 * Its keys are made with WebCrypto at start; a test can make it misbehave through `tamper`.
 */
import { createHash } from "node:crypto";

export type FakeUser = { sub: string; name?: string | undefined; groups?: string[] | undefined };

type Grant = { user: FakeUser; redirectUri: string; challenge: string; nonce: string };

/** What a test may change in the next ID token: its claims, its header, or the whole token */
export type Tamper = {
  claims?: (claims: Record<string, unknown>) => Record<string, unknown>;
  header?: (header: Record<string, unknown>) => Record<string, unknown>;
  token?: (token: string) => string;
};

type Options = { issuer: string; clientId: string; clientSecret: string; now?: () => number };

type Provider = {
  options: Options;
  privateKey: CryptoKey;
  kid: string;
  grants: Map<string, Grant>;
  state: { tamper: Tamper | undefined; jwksFetches: number };
};

const b64 = (data: Uint8Array | string) =>
  Buffer.from(typeof data === "string" ? new TextEncoder().encode(data) : data).toString(
    "base64url",
  );

const randomText = () => b64(crypto.getRandomValues(new Uint8Array(24)));

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A JWT signed with the provider's key, or with what `tamper` says */
const signToken = async (p: Provider, claims: Record<string, unknown>) => {
  const tamper = p.state.tamper;
  const plain = { alg: "RS256", kid: p.kid, typ: "JWT" };
  const header = tamper?.header?.(plain) ?? plain;
  const body = tamper?.claims?.(claims) ?? claims;
  const signed = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(body))}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    p.privateKey,
    new TextEncoder().encode(signed),
  );
  const token = `${signed}.${b64(new Uint8Array(signature))}`;
  return tamper?.token?.(token) ?? token;
};

/** The authorization endpoint's answer for a user: the redirect back with code and state */
const authorize = (p: Provider, url: URL, user: FakeUser) => {
  const params = url.searchParams;
  if (params.get("client_id") !== p.options.clientId) return undefined;
  if (params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256")
    return undefined;
  const code = randomText();
  p.grants.set(code, {
    user,
    redirectUri: params.get("redirect_uri") ?? "",
    challenge: params.get("code_challenge") ?? "",
    nonce: params.get("nonce") ?? "",
  });
  const back = new URL(params.get("redirect_uri") ?? "");
  back.searchParams.set("code", code);
  back.searchParams.set("state", params.get("state") ?? "");
  return back;
};

const clientOk = (p: Provider, request: Request, form: URLSearchParams) => {
  const { clientId, clientSecret } = p.options;
  const pair = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`;
  return (
    request.headers.get("authorization") === `Basic ${btoa(pair)}` ||
    form.get("client_secret") === clientSecret
  );
};

const idTokenFor = (p: Provider, grant: Grant) => {
  const seconds = Math.floor((p.options.now ?? Date.now)() / 1000);
  return signToken(p, {
    iss: p.options.issuer,
    sub: grant.user.sub,
    aud: p.options.clientId,
    exp: seconds + 300,
    iat: seconds,
    nonce: grant.nonce,
    ...(grant.user.name ? { name: grant.user.name } : {}),
    ...(grant.user.groups ? { groups: grant.user.groups } : {}),
  });
};

/** The token endpoint: each code once (RFC 6749 §4.1.2), with its verifier, client and address */
const token = async (p: Provider, request: Request) => {
  const form = new URLSearchParams(await request.text());
  const code = form.get("code") ?? "";
  const grant = p.grants.get(code);
  p.grants.delete(code);
  const challenge = createHash("sha256")
    .update(form.get("code_verifier") ?? "")
    .digest("base64url");
  if (
    !grant ||
    !clientOk(p, request, form) ||
    form.get("grant_type") !== "authorization_code" ||
    form.get("redirect_uri") !== grant.redirectUri ||
    challenge !== grant.challenge
  )
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  const idToken = await idTokenFor(p, grant);
  return Response.json({ access_token: randomText(), token_type: "Bearer", id_token: idToken });
};

/** A login form, as an identity provider shows one; e2e tests fill it in */
const form = (url: URL) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>Fake IdP</title><form method="post">` +
      `<input type="hidden" name="query" value="${escapeHtml(url.search)}">` +
      `<label>User <input name="sub"></label><label>Name <input name="name"></label>` +
      `<label>Groups <input name="groups"></label><button>Sign in</button></form>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

const submitForm = async (p: Provider, request: Request, url: URL) => {
  const fields = new URLSearchParams(await request.text());
  const query = new URL(`${url.origin}${url.pathname}${fields.get("query") ?? ""}`);
  const groups = (fields.get("groups") ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  const user = { sub: fields.get("sub") ?? "", name: fields.get("name") || undefined, groups };
  const back = authorize(p, query, user);
  return back
    ? Response.redirect(back.toString(), 302)
    : new Response("invalid request", { status: 400 });
};

const discovery = (issuer: string) => ({
  issuer,
  authorization_endpoint: `${issuer}/authorize`,
  token_endpoint: `${issuer}/token`,
  jwks_uri: `${issuer}/jwks`,
  response_types_supported: ["code"],
  id_token_signing_alg_values_supported: ["RS256"],
  code_challenge_methods_supported: ["S256"],
});

const handle = async (p: Provider, jwks: unknown, request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.endsWith("/.well-known/openid-configuration"))
    return Response.json(discovery(p.options.issuer));
  if (path.endsWith("/jwks")) {
    p.state.jwksFetches += 1;
    return Response.json(jwks);
  }
  if (path.endsWith("/token") && request.method === "POST") return token(p, request);
  if (path.endsWith("/authorize"))
    return request.method === "POST" ? submitForm(p, request, url) : form(url);
  return new Response("not found", { status: 404 });
};

export const createFakeIdp = async (options: Options) => {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const { n, e } = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const p: Provider = {
    options,
    privateKey: keyPair.privateKey,
    kid: "fake-1",
    grants: new Map(),
    state: { tamper: undefined, jwksFetches: 0 },
  };
  const publicJwk = { kty: "RSA", n, e, kid: p.kid, alg: "RS256", use: "sig" };
  const jwks = { keys: [publicJwk] };
  return {
    handle: (request: Request) => handle(p, jwks, request),
    fetch: (input: string | URL | Request, init?: RequestInit) =>
      handle(p, jwks, input instanceof Request ? input : new Request(input, init)),
    authorize: (url: URL, user: FakeUser) => authorize(p, url, user),
    signToken: (claims: Record<string, unknown>) => signToken(p, claims),
    publicJwk,
    state: p.state,
  };
};

export type FakeIdp = Awaited<ReturnType<typeof createFakeIdp>>;
