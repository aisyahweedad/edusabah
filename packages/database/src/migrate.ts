import { mkdirSync } from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { loadEnv, findRepoRoot } from "@k-aecs/config";
import { getDb, getClient } from "./index.js";

async function main() {
  const env = loadEnv();
  const target = env.DATABASE_URL.replace(/^(sqlite:|file:sqlite:|file:)/, "");
  const root = findRepoRoot();
  const location = target === ":memory:" || target.startsWith("/") ? target : path.resolve(root, target);
  if (target !== ":memory:") mkdirSync(path.dirname(location), { recursive: true });

  const migrationsFolder = path.resolve(root, "packages/database/src/migrations");
  const db = getDb();
  await migrate(db, { migrationsFolder });
  getClient().close();
  console.log(`migrations applied -> ${location}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("migration failed", err);
  process.exit(1);
});
