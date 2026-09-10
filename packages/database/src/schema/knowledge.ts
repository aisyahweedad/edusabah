import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text, customType } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id", { length: 36 })
    .primaryKey()
    .notNull()
    .$defaultFn(() => randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

const vector = (_dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return "text";
    },
    toDriver(value: number[]): string {
      return JSON.stringify(value);
    },
    fromDriver(value: string): number[] {
      try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed.map(Number) : [];
      } catch {
        return [];
      }
    },
  });

export const knowledgeSources = sqliteTable(
  "knowledge_sources",
  {
    id: id(),
    title: text("title", { length: 300 }).notNull(),
    category: text("category", { length: 60 }).notNull().default("general"),
    sourceUrl: text("source_url", { length: 500 }),
    priority: integer("priority").notNull().default(1),
    status: text("status", { length: 24 }).notNull().default("draft"),
    checksum: text("checksum", { length: 64 }),
    currentVersion: integer("current_version").notNull().default(1),
    uploadedBy: text("uploaded_by", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    knowledge_sources_status_idx: index("knowledge_sources_status_idx").on(t.status),
    knowledge_sources_category_idx: index("knowledge_sources_category_idx").on(t.category),
    knowledge_sources_priority_idx: index("knowledge_sources_priority_idx").on(t.priority),
  }),
);

export const knowledgeVersions = sqliteTable(
  "knowledge_versions",
  {
    id: id(),
    sourceId: text("source_id", { length: 36 })
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    markdown: text("markdown").notNull(),
    checksum: text("checksum", { length: 64 }),
    changeNote: text("change_note", { length: 300 }),
    createdBy: text("created_by", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => ({
    knowledge_versions_source_idx: index("knowledge_versions_source_idx").on(t.sourceId),
    knowledge_versions_version_idx: index("knowledge_versions_version_idx").on(t.sourceId, t.version),
  }),
);

export const knowledgeChunks = sqliteTable(
  "knowledge_chunks",
  {
    id: id(),
    sourceId: text("source_id", { length: 36 })
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector(4096)(),
    tokenCount: integer("token_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({ knowledge_chunks_source_idx: index("knowledge_chunks_source_idx").on(t.sourceId) }),
);

export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type NewKnowledgeSource = typeof knowledgeSources.$inferInsert;
export type KnowledgeVersion = typeof knowledgeVersions.$inferSelect;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
