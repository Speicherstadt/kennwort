// Weber Haustechnik with an identity provider (K-604): the fake provider in-process, Jonas as owner,
// Anna certified, and helpers that walk a browser through a login as the provider sends it back
import { encodeBytes } from "@kennwort/core";
import { createProvider } from "../oidc/provider.ts";
import { createFakeIdp, type FakeUser } from "./fake-idp.ts";
import { weber } from "./weber-vaults.ts";

export const ISSUER = "https://sso.weber-haustechnik.test/realms/weber";
export const CLIENT = "kennwort";

export const oidcWeber = async () => {
  let clock = () => Date.now();
  const idp = await createFakeIdp({
    issuer: ISSUER,
    clientId: CLIENT,
    clientSecret: "client-secret",
    now: () => clock(),
  });
  const w = await weber({
    oidc: (now) => {
      clock = now;
      return createProvider(
        {
          issuer: ISSUER,
          clientId: CLIENT,
          clientSecret: "client-secret",
          name: "Weber SSO",
          scopes: "openid profile",
        },
        idp.fetch,
        now,
      );
    },
  });
  const companyId = encodeBytes(w.o.company.companyId);
  const request = w.o.setup.request;
  const openEnrolment = (open = true, token = w.o.token) =>
    request("/api/oidc/enrolment", { method: "PUT", token, body: { open } });

  /** Starts a login (or takes a started one), lets the provider answer, returns the fragment */
  const login = async (
    user: FakeUser,
    options: { start?: string; cookie?: string | null; token?: string } = {},
  ) => {
    const start = options.token
      ? await request("/api/oidc/link", { method: "POST", token: options.token })
      : await request(options.start ?? `/auth/oidc/start?company=${companyId}`);
    const location = options.token
      ? ((await start.json()) as { url: string }).url
      : (start.headers.get("location") ?? "");
    const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const back = idp.authorize(new URL(location), user);
    if (!back) throw new Error("the provider refused the authorization request");
    return callback(back, options.cookie === undefined ? cookie : options.cookie);
  };

  const callback = async (back: URL, cookie: string | null) => {
    const answer = await request(`${back.pathname}${back.search}`, {
      headers: cookie ? { cookie } : {},
    });
    const fragment = new URLSearchParams(
      new URL(answer.headers.get("location") ?? "").hash.slice(1),
    );
    return {
      status: answer.status,
      location: answer.headers.get("location") ?? "",
      ticket: fragment.get("ticket"),
      error: fragment.get("error"),
      back,
      cookie,
    };
  };

  /** Enrols with a ticket the way the app does: an account ID and sign-in key of its own */
  const enrol = async (ticket: string, accountId = crypto.getRandomValues(new Uint8Array(16))) =>
    request("/auth/oidc/enrol", {
      body: {
        ticket,
        accountId: encodeBytes(accountId),
        loginPublicKey: encodeBytes(new Uint8Array(32).fill(3)),
        accountSalt: encodeBytes(new Uint8Array(16).fill(4)),
      },
    });

  return { w, idp, companyId, request, openEnrolment, login, callback, enrol };
};
export type OidcWeber = Awaited<ReturnType<typeof oidcWeber>>;
