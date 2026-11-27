// Serves the fake identity provider (fake-idp.ts) for the e2e tests (K-604): discovery, keys, a
// login form that names the person, and the token endpoint. Port, issuer and
// client come from playwright.config.ts (e2e/oidc.ts); never part of a release
import { createFakeIdp } from "./fake-idp.ts";

const port = Number(process.env.FAKE_IDP_PORT);
const idp = await createFakeIdp({
  issuer: process.env.FAKE_IDP_ISSUER ?? `http://localhost:${port}`,
  clientId: process.env.FAKE_IDP_CLIENT_ID ?? "",
  clientSecret: process.env.FAKE_IDP_CLIENT_SECRET ?? "",
});

Bun.serve({ port, fetch: (request) => idp.handle(request) });
