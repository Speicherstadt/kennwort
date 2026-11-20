// Writes src/db/migrations.gen.ts from drizzle/ (see src/db/embed.ts); run after drizzle-kit generate
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { migrationsModule, readMigrations } from "../src/db/embed.ts";

const root = join(import.meta.dirname, "..");
writeFileSync(
  join(root, "src/db/migrations.gen.ts"),
  migrationsModule(readMigrations(join(root, "drizzle"))),
);
