/**
 * The identity provider a self-hoster connects (K-604): issuer, client, scopes and the claim that
 * lists a person's groups. Without an issuer, sign-in with OpenID Connect is off. The client secret
 * is a setting like the auth secret: never in a log, never sent to a client.
 */
import { z } from "zod";

/** Plain http only for a provider on this machine, as in tests; anything else needs TLS */
const isLocal = (url: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

const Settings = z.object({
  KENNWORT_OIDC_ISSUER: z
    .url({ protocol: /^https?$/ })
    .refine((text) => {
      const url = URL.parse(text);
      return url !== null && (url.protocol === "https:" || isLocal(url));
    })
    .optional(),
  KENNWORT_OIDC_CLIENT_ID: z.string().min(1).max(255).optional(),
  KENNWORT_OIDC_CLIENT_SECRET: z.string().min(1).max(1024).optional(),
  // The label of the button: "Mit <name> anmelden"
  KENNWORT_OIDC_NAME: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine((text) => !/\p{Cc}/u.test(text))
    .default("OpenID Connect"),
  KENNWORT_OIDC_SCOPES: z
    .string()
    .regex(/^[\x21\x23-\x5B\x5D-\x7E]+( [\x21\x23-\x5B\x5D-\x7E]+)*$/)
    .refine((scopes) => scopes.split(" ").includes("openid"))
    .default("openid profile"),
  KENNWORT_OIDC_GROUPS_CLAIM: z
    .string()
    .regex(/^[A-Za-z0-9_:./-]{1,100}$/)
    .default("groups"),
});

export type OidcSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string | undefined;
  name: string;
  scopes: string;
  groupsClaim: string;
};

export const readOidcSettings = (
  env: Record<string, string | undefined>,
): { ok: true; value: OidcSettings | undefined } | { ok: false; error: string[] } => {
  const parsed = Settings.safeParse(env);
  if (!parsed.success)
    return {
      ok: false,
      error: [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))],
    };
  const data = parsed.data;
  if (!data.KENNWORT_OIDC_ISSUER) return { ok: true, value: undefined };
  if (!data.KENNWORT_OIDC_CLIENT_ID) return { ok: false, error: ["KENNWORT_OIDC_CLIENT_ID"] };
  return {
    ok: true,
    value: {
      issuer: data.KENNWORT_OIDC_ISSUER,
      clientId: data.KENNWORT_OIDC_CLIENT_ID,
      clientSecret: data.KENNWORT_OIDC_CLIENT_SECRET,
      name: data.KENNWORT_OIDC_NAME,
      scopes: data.KENNWORT_OIDC_SCOPES,
      groupsClaim: data.KENNWORT_OIDC_GROUPS_CLAIM,
    },
  };
};
