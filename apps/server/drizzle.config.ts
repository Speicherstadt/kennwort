import { defineConfig } from "drizzle-kit";

// `bun run db:generate` writes a migration for a changed schema and embeds it (scripts/embed-migrations.ts)
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
