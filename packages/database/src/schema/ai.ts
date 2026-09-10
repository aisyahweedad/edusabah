import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Citation } from "@k-aecs/shared";

const id = () =>
  text("id", { length: 36 })
    .primaryKey()
    .notNull()
    .$defaultFn(() => randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const aiRuns = sqliteTable(
  "ai_runs",
  {
    id: id(),
    conversationId: text("conversation_id", { length: 36 }),
    channelId: text("channel_id", { length: 64 }),
    actorKind: text("actor_kind", { length: 16 }).notNull(),
    actorId: text("actor_id", { length: 64 }).notNull(),
    role: text("role", { length: 30 }),
    intent: text("intent", { length: 30 }),
    model: text("model", { length: 100 }).notNull(),
    provider: text("provider", { length: 100 }),
    status: text("status", { length: 24 }).notNull(),
    userMessage: text("user_message").notNull(),
    userMessageHash: text("user_message_hash", { length: 64 }).notNull(),
    assistantText: text("assistant_text"),
    tokensInput: integer("tokens_input").notNull().default(0),
    tokensOutput: integer("tokens_output").notNull().default(0),
    tokensReasoning: integer("tokens_reasoning").notNull().default(0),
    promptChars: integer("prompt_chars").notNull().default(0),
    turns: integer("turns").notNull().default(0),
    citations: text("citations", { mode: "json" })
      .$type<Citation[]>()
      .notNull()
      .$defaultFn(() => []),
    costUsdMicros: integer("cost_usd_micros").notNull().default(0),
    error: text("error"),
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => ({
    ai_runs_conversation_idx: index("ai_runs_conversation_idx").on(t.conversationId),
    ai_runs_actor_idx: index("ai_runs_actor_idx").on(t.actorKind, t.actorId),
    ai_runs_created_idx: index("ai_runs_created_idx").on(t.createdAt),
    ai_runs_intent_idx: index("ai_runs_intent_idx").on(t.intent),
    ai_runs_status_idx: index("ai_runs_status_idx").on(t.status),
  }),
);

export const aiToolCalls = sqliteTable(
  "ai_tool_calls",
  {
    id: id(),
    runId: text("run_id", { length: 36 })
      .notNull()
      .references(() => aiRuns.id, { onDelete: "cascade" }),
    toolName: text("tool_name", { length: 80 }).notNull(),
    args: text("args"),
    ok: integer("ok", { mode: "boolean" }).notNull().default(true),
    resultChars: integer("result_chars").notNull().default(0),
    resultPreview: text("result_preview"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => ({
    ai_tool_calls_run_idx: index("ai_tool_calls_run_idx").on(t.runId),
    ai_tool_calls_tool_idx: index("ai_tool_calls_tool_idx").on(t.toolName),
  }),
);

export type AiRun = typeof aiRuns.$inferSelect;
export type NewAiRun = typeof aiRuns.$inferInsert;
export type AiToolCall = typeof aiToolCalls.$inferSelect;
