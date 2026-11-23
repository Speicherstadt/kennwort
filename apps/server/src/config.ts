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
  // Web Push (K-602): on by default; the pushes are empty, a push service learns only when
  KENNWORT_PUSH: z.enum(["true", "false"]).default("true"),
  // Who sends, for the push services (RFC 8292 `sub`): a mailto: or https address, else the public one
  KENNWORT_PUSH_SUBJECT: z
    .string()
    .regex(/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/)
    .optional(),
  // More push services besides those of the common browsers, as host names separated by commas
  KENNWORT_PUSH_HOSTS: z
    .string()
    .regex(/^[a-z0-9.-]+(,[a-z0-9.-]+)*$/)
    .optional(),
});

export type Config = {
  port: number;
  database: string;
  logLevel: z.infer<typeof Config>["KENNWORT_LOG_LEVEL"];
  publicUrl: string;
  authSecret: string;
  behindProxy: boolean;
  setupCode: string | undefined;
  /** Web Push (K-602): undefined when turned off */
  push: { subject: string; extraHosts: string[] } | undefined;
};

export const readConfig = (env: Record<string, string | undefined>) => {
  const parsed = Config.safeParse(env);
  if (!parsed.success)
    return { ok: false as const, error: parsed.error.issues.map((issue) => issue.path.join(".")) };
  const data = parsed.data;
  const value: Config = {
    port: data.KENNWORT_PORT,
    database: data.KENNWORT_DATABASE,
    logLevel: data.KENNWORT_LOG_LEVEL,
    publicUrl: data.KENNWORT_PUBLIC_URL,
    authSecret: data.KENNWORT_AUTH_SECRET,
    behindProxy: data.KENNWORT_BEHIND_PROXY === "true",
    setupCode: data.KENNWORT_SETUP_CODE,
    push:
      data.KENNWORT_PUSH === "true"
        ? {
            subject: data.KENNWORT_PUSH_SUBJECT ?? data.KENNWORT_PUBLIC_URL,
            extraHosts: data.KENNWORT_PUSH_HOSTS?.split(",") ?? [],
          }
        : undefined,
  };
  return { ok: true as const, value };
};
