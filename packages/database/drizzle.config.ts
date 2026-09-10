import { defineConfig } from "drizzle-kit";
import "dotenv/config";

// NOTE: drizzle-kit's own bundler cannot resolve the NodeNext-style ".js"
// relative import specifiers used across schema modules, so the db-*
// scripts (defined in package.json) run drizzle-kit under tsx, whose loader
// remaps ".js" -> ".ts" at runtime. `generate` needs no live database;
// `push`/`migrate` target the SQLite file from DATABASE_URL.

const url = process.env.DATABASE_URL ?? "sqlite:./data/kaecs.db";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url,
  },
  verbose: true,
  strict: true,
  casing: "snake_case",
  migrations: {
    prefix: "timestamp",
  },
});
