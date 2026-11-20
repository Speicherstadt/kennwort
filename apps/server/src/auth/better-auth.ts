/**
 * Sign-in with Better Auth (docs/plan.md, Stack): passkeys (WebAuthn, @better-auth/passkey) and
 * sessions as bearer tokens for the web app, the extension and the CLI. Better Auth only signs in;
 * it never decrypts anything (P-02). Email and password are off: Kennwort has no passwords that
 * reach the server, the notweg is the sign-in key (login-key.ts).
 */
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins/bearer";
import type { Db } from "../db/database.ts";
import { authAccount, authPasskey, authSession, authUser, authVerification } from "../db/schema.ts";

export type AuthOptions = { secret: string; baseURL: string; rpID: string; origin: string };

/**
 * What the server uses of Better Auth. The full inferred type drags in SimpleWebAuthn's types,
 * which TypeScript cannot name in declarations; this narrow one is all the routes need.
 */
export type Auth = {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (input: {
      headers: Headers;
    }) => Promise<{ user: { id: string; companyId?: unknown } } | null>;
  };
  $context: Promise<{
    internalAdapter: {
      createUser: (user: {
        name: string;
        email: string;
        emailVerified: boolean;
        companyId: string;
      }) => Promise<{ id: string }>;
      createSession: (userId: string) => Promise<{ token: string } | null>;
    };
  }>;
};

export const createAuth = (db: Db, options: AuthOptions): Auth =>
  betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    basePath: "/auth",
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
        passkey: authPasskey,
      },
    }),
    emailAndPassword: { enabled: false },
    user: { additionalFields: { companyId: { type: "string", required: true, input: false } } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, window: 60, max: 30 },
    telemetry: { enabled: false },
    trustedOrigins: [options.origin],
    plugins: [
      bearer(),
      passkey({ rpID: options.rpID, rpName: "Kennwort", origin: options.origin }),
    ],
  }) as unknown as Auth;

/** The session of a request (bearer token or cookie), as K-202's authenticate expects it */
export const authenticateWith = (auth: Auth) => async (request: Request) => {
  const found = await auth.api.getSession({ headers: request.headers });
  if (!found) return undefined;
  const companyId = (found.user as { companyId?: unknown }).companyId;
  return typeof companyId === "string" ? { accountId: found.user.id, companyId } : undefined;
};
