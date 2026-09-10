import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Citation } from "@k-aecs/shared";
import { citizens } from "./citizens.js";

const id = () =>
  text("id", { length: 36 })
    .primaryKey()
    .notNull()
    .$defaultFn(() => randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const conversations = sqliteTable(
  "conversations",
  {
    id: id(),
    citizenId: text("citizen_id", { length: 36 })
      .notNull()
      .references(() => citizens.id, { onDelete: "cascade" }),
    channel: text("channel", { length: 20 }).notNull().default("telegram"),
    channelThreadId: text("channel_thread_id", { length: 64 }),
    title: text("title", { length: 200 }),
    status: text("status", { length: 24 }).notNull().default("active"),
    intent: text("intent", { length: 30 }).notNull().default("general"),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: createdAt(),
  },
  (t) => ({
    conversations_citizen_idx: index("conversations_citizen_idx").on(t.citizenId),
    conversations_channel_thread_idx: index("conversations_channel_thread_idx").on(t.channel, t.channelThreadId),
  }),
);

export const messages = sqliteTable(
  "messages",
  {
    id: id(),
    conversationId: text("conversation_id", { length: 36 })
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { length: 16 }).notNull(),
    content: text("content").notNull(),
    intent: text("intent", { length: 30 }),
    citations: text("citations", { mode: "json" })
      .$type<Citation[]>()
      .notNull()
      .$defaultFn(() => []),
    toolCalls: text("tool_calls", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    createdAt: createdAt(),
  },
  (t) => ({
    messages_conversation_idx: index("messages_conversation_idx").on(t.conversationId),
    messages_created_idx: index("messages_created_idx").on(t.createdAt),
  }),
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
