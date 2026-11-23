export type FakeUser = {
  sub: string;
  name?: string | undefined;
  groups?: string[] | undefined;
};
/** What a test may change in the next ID token: its claims, its header, or the whole token */
export type Tamper = {
  claims?: (claims: Record<string, unknown>) => Record<string, unknown>;
  header?: (header: Record<string, unknown>) => Record<string, unknown>;
  token?: (token: string) => string;
};
type Options = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  now?: () => number;
};
export declare const createFakeIdp: (options: Options) => Promise<{
  handle: (request: Request) => Promise<Response>;
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  authorize: (url: URL, user: FakeUser) => URL | undefined;
  signToken: (claims: Record<string, unknown>) => Promise<string>;
  publicJwk: {
    kty: string;
    n: string | undefined;
    e: string | undefined;
    kid: string;
    alg: string;
    use: string;
  };
  state: {
    tamper: Tamper | undefined;
    jwksFetches: number;
  };
}>;
export type FakeIdp = Awaited<ReturnType<typeof createFakeIdp>>;
