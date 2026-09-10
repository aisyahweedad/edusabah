import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const districts = sqliteTable(
  "districts",
  {
    id: text("id", { length: 10 }).primaryKey().notNull(),
    name: text("name", { length: 100 }).notNull(),
    code: text("code", { length: 10 }).unique().notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => ({ districts_code_idx: index("districts_code_idx").on(t.code) }),
);

export const institutions = sqliteTable(
  "institutions",
  {
    id: text("id", { length: 40 }).primaryKey().notNull(),
    name: text("name", { length: 200 }).notNull(),
    code: text("code", { length: 40 }).unique().notNull(),
    districtCode: text("district_code", { length: 10 }).references(() => districts.id),
    type: text("type", { length: 30 }).notNull().default("school"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => ({
    institutions_code_idx: index("institutions_code_idx").on(t.code),
    institutions_district_idx: index("institutions_district_idx").on(t.districtCode),
  }),
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id", { length: 30 }).primaryKey().notNull(),
    name: text("name", { length: 100 }).notNull(),
    parentId: text("parent_id", { length: 30 }),
    description: text("description", { length: 300 }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => ({ categories_parent_idx: index("categories_parent_idx").on(t.parentId) }),
);

export type District = typeof districts.$inferSelect;
export type Institution = typeof institutions.$inferSelect;
export type Category = typeof categories.$inferSelect;
