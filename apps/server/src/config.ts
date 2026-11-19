/** The server's settings from the environment, parsed with Zod like every other boundary */
import { z } from "zod";

const Config = z.object({
  KENNWORT_PORT: z.coerce.number().int().min(1).max(65535).default(8100),
  KENNWORT_DATABASE: z.string().min(1).default("data/kennwort.db"),
  KENNWORT_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = {
  port: number;
  database: string;
  logLevel: z.infer<typeof Config>["KENNWORT_LOG_LEVEL"];
};

export const readConfig = (env: Record<string, string | undefined>) => {
  const parsed = Config.safeParse(env);
  if (!parsed.success)
    return { ok: false as const, error: parsed.error.issues.map((issue) => issue.path.join(".")) };
  const { KENNWORT_PORT, KENNWORT_DATABASE, KENNWORT_LOG_LEVEL } = parsed.data;
  return {
    ok: true as const,
    value: { port: KENNWORT_PORT, database: KENNWORT_DATABASE, logLevel: KENNWORT_LOG_LEVEL },
  };
};
