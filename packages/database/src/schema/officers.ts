import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const officers = sqliteTable(
  "officers",
  {
    id: id(),
    email: text("email", { length: 200 }).unique().notNull(),
    name: text("name", { length: 120 }).notNull(),
    role: text("role", { length: 30 }).notNull().default("kpsti_officer"),
    passwordHash: text("password_hash", { length: 200 }).notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by", { length: 36 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ officers_role_idx: index("officers_role_idx").on(t.role) }),
);

export type Officer = typeof officers.$inferSelect;
export type NewOfficer = typeof officers.$inferInsert;
