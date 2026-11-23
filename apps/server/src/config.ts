/** The server's settings from the environment, parsed with Zod like every other boundary */
import { z } from "zod";

const Config = z.object({
  KENNWORT_PORT: z
    .string()
    .regex(/^\d{1,5}$/)
    .transform(Number)
    .pipe(z.number().min(1).max(65535))
    .default(8100),
  KENNWORT_DATABASE: z.string().min(1).default("data/kennwort.db"),
  KENNWORT_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // The address people open; passkeys are bound to its host name (WebAuthn relying party)
  KENNWORT_PUBLIC_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:8100"),
  // Signs sessions; at least 32 characters, generated once per installation
  KENNWORT_AUTH_SECRET: z.string().min(32),
  // Behind a reverse proxy the rate limits count the address it appends to X-Forwarded-For
  KENNWORT_BEHIND_PROXY: z.enum(["true", "false"]).default("false"),
  // Lets the first owner create the company (POST /auth/setup); chosen by the admin, at least 16
  // characters, and never written to a log. Without it the server cannot be set up from outside.
  KENNWORT_SETUP_CODE: z.string().min(16).optional(),
  // The built web app (apps/web/dist) the server serves with its security headers; without it a
  // reverse proxy serves the app and must send the same headers (docs/sicherheitsdesign.md, P-16)
  KENNWORT_WEB_ROOT: z.string().min(1).optional(),
  // Where the leak check (K-603) gets its ranges: the address up to the prefix, ending in "/",
  // such as a mirror of Pwned Passwords; "off" turns the check off for everyone on this server
  KENNWORT_PWNED_URL: z
    .union([z.literal("off"), z.url({ protocol: /^https?$/ }).regex(/\/$/)])
    .default("https://api.pwnedpasswords.com/range/"),
});

export type Config = {
  port: number;
  database: string;
  logLevel: z.infer<typeof Config>["KENNWORT_LOG_LEVEL"];
  publicUrl: string;
  authSecret: string;
  behindProxy: boolean;
  setupCode: string | undefined;
  webRoot: string | undefined;
  /** People reach the server over https: HSTS and upgrade-insecure-requests */
  secure: boolean;
  /** The leak check's range address, or undefined when the operator turned it off */
  pwnedUrl: string | undefined;
};

export const readConfig = (env: Record<string, string | undefined>) => {
  const parsed = Config.safeParse(env);
  if (!parsed.success)
    // Each setting once, though a union reports one issue per branch
    return {
      ok: false as const,
      error: [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))],
    };
  const data = parsed.data;
  const value: Config = {
    port: data.KENNWORT_PORT,
    database: data.KENNWORT_DATABASE,
    logLevel: data.KENNWORT_LOG_LEVEL,
    publicUrl: data.KENNWORT_PUBLIC_URL,
    authSecret: data.KENNWORT_AUTH_SECRET,
    behindProxy: data.KENNWORT_BEHIND_PROXY === "true",
    setupCode: data.KENNWORT_SETUP_CODE,
    webRoot: data.KENNWORT_WEB_ROOT,
    secure: new URL(data.KENNWORT_PUBLIC_URL).protocol === "https:",
    pwnedUrl: data.KENNWORT_PWNED_URL === "off" ? undefined : data.KENNWORT_PWNED_URL,
  };
  return { ok: true as const, value };
};
