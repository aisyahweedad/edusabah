import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { loadEnv, findRepoRoot } from "@k-aecs/config";
import * as schema from "./schema/index.js";

export type Database = LibSQLDatabase<typeof schema>;

let client: Client | null = null;
let db: Database | null = null;

/** Resolve a `sqlite:` / `file:` / plain path into an absolute file URL string. */
function resolveDbPath(raw: string): string {
  for (const prefix of ["sqlite:", "file:sqlite:", "file:"]) {
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
  }
  return raw;
}

function build() {
  const env = loadEnv();
  const target = resolveDbPath(env.DATABASE_URL);

  let location = target;
  if (target !== ":memory:" && !target.startsWith("/") && !/^[a-zA-Z]+:/.test(target)) {
    const root = findRepoRoot();
    location = path.resolve(root, target);
    mkdirSync(path.dirname(location), { recursive: true, });
  }

  client = createClient({ url: `file:${location}` });
  return drizzle(client, { schema }) as Database;
}

export function getDb(): Database {
  if (!db) db = build();
  return db;
}

export function getClient(): Client {
  if (!client) getDb();
  if (!client) throw new Error("database client not initialised");
  return client;
}

export async function closeDb() {
  client?.close();
  client = null;
  db = null;
}

export { findRepoRoot };
