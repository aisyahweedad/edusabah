import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id", { length: 36 })
    .primaryKey()
    .notNull()
    .$defaultFn(() => randomUUID());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const systemSettings = sqliteTable(
  "system_settings",
  {
    id: id(),
    key: text("key", { length: 80 }).unique().notNull(),
    value: text("value", { mode: "json" }).$type<unknown>().notNull(),
    description: text("description", { length: 300 }),
    updatedBy: text("updated_by", { length: 64 }),
    updatedAt: updatedAt(),
  },
  (t) => ({ system_settings_key_idx: index("system_settings_key_idx").on(t.key) }),
);

export type SystemSetting = typeof systemSettings.$inferSelect;
