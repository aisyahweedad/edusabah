import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const Bool = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .transform((v) => ["true", "1", "yes"].includes(v));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TZ: z.string().default("Asia/Kuching"),
  LOG_LEVEL: z.string().default("info"),

  // SQLite (dev/deployment default): DATABASE_URL=sqlite:<path>, resolved
  // against the repo root. No Postgres server required.
  DATABASE_URL: z.string().default("sqlite:./data/kaecs.db"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_REGION: z.string().default("ap-southeast-1"),
  S3_BUCKET: z.string().default("kaecs-files"),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_USE_SSL: Bool.default("false"),
  S3_PUBLIC_BASE_URL: z.string().default("http://localhost:9000/kaecs-files"),

  AUTH_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("8h"),
  SESSION_TTL_HOURS: z.coerce.number().default(24),

  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  PUBLIC_API_URL: z.string().default("http://localhost:3001"),

  // Pintu gerbang LLM — LiteLLM di router.pixel-space.co (sama seperti
  // projek mosti-library). Endpoint OpenAI-compatible: /v1/chat/completions,
  // /v1/embeddings, /v1/audio/*.
  AI_CHAT_BASE_URL: z.string().default("https://router.pixel-space.co"),
  AI_CHAT_API_KEY: z.string().default(""),
  AI_CHAT_MODEL: z.string().default("ds4-flash"),
  AI_CHAT_CONTEXT_WINDOW: z.coerce.number().default(131072),

  SECRETARY_AI_BASE_URL: z.string().optional().default(""),
  SECRETARY_AI_API_KEY: z.string().optional().default(""),
  SECRETARY_AI_MODEL: z.string().optional().default(""),

  AI_EMBED_BASE_URL: z.string().default("https://router.pixel-space.co"),
  AI_EMBED_API_KEY: z.string().default(""),
  AI_EMBED_MODEL: z.string().default("qwen3-vl-embedding-8b"),
  AI_EMBED_DIMENSIONS: z.coerce.number().default(4096),

  AI_STT_BASE_URL: z.string().optional().default("https://router.pixel-space.co"),
  AI_STT_API_KEY: z.string().optional().default(""),
  AI_STT_MODEL: z.string().optional().default("qwen3-asr"),

  WEB_SEARCH_PROVIDER: z.enum(["duckduckgo", "tavily", "exa", "none"]).default("duckduckgo"),
  WEB_SEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(20).default(8),
  WEB_SEARCH_TIMEOUT_MS: z.coerce.number().default(12000),
  TAVILY_API_KEY: z.string().optional().default(""),
  EXA_API_KEY: z.string().optional().default(""),

  HARNESS_MAX_TURNS: z.coerce.number().int().min(1).max(50).default(12),
  HARNESS_STREAM_TIMEOUT_MS: z.coerce.number().default(120_000),
  HARNESS_THINKING_LEVEL: z.enum(["off", "low", "medium", "high"]).default("low"),
  AUDIT_KEEP_ARGS: Bool.default("true"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Find the monorepo root (where .env + pnpm-workspace.yaml live) by walking
 * upward from cwd, so any app/package can load the same root .env.
 */
export function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  while (true) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function loadEnv(overrides: Record<string, string | undefined> = {}): Env {
  if (cached) return cached;
  // Turbo runs a package from that package's directory, so the root .env is a
  // few levels up. Dotenv loads it explicitly; real process env still wins on
  // no, nothing — order must put explicit env first, then file fallback.
  const root = findRepoRoot();
  loadDotenv({ path: path.join(root, ".env"), override: false });

  const source: Record<string, string | undefined> = {};
  for (const key of ["AUTH_SECRET"]) {
    const value = process.env[key] ?? overrides[key];
    // Surface early if AUTH_SECRET is the obvious placeholder, so a fresh
    // checkout gets a loud error instead of weak sessions.
    if (value) source[key] = value;
  }

  const merged = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();
