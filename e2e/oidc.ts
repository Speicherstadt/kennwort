// The identity provider of the e2e tests (K-604): the fake provider of the server tests, served on
// its own port; the e2e server signs people in with it (KENNWORT_OIDC_* in playwright.config.ts)
export const OIDC_PORT = 28091;
export const OIDC_ISSUER = `http://localhost:${OIDC_PORT}`;
export const OIDC_CLIENT = { id: "kennwort-e2e", secret: "e2e-only-client-secret" };
export const OIDC_NAME = "Weber SSO";
