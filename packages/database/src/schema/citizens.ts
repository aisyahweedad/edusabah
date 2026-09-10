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

export const citizenRoles = ["public", "verified_citizen", "flagged", "blocked"] as const;

export const citizens = sqliteTable(
  "citizens",
  {
    id: id(),
    name: text("name", { length: 120 }),
    phone: text("phone", { length: 20 }),
    icNumber: text("ic_number", { length: 12 }),
    districtCode: text("district_code", { length: 10 }),
    institutionCode: text("institution_code", { length: 40 }),
    status: text("status", { length: 24 }).notNull().default("public"),
    consentVersion: text("consent_version", { length: 20 }),
    consentAcceptedAt: integer("consent_accepted_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by", { length: 36 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    citizens_ic_idx: index("citizens_ic_idx").on(t.icNumber),
    citizens_phone_idx: index("citizens_phone_idx").on(t.phone),
    citizens_status_idx: index("citizens_status_idx").on(t.status),
  }),
);

export const telegramAccounts = sqliteTable(
  "telegram_accounts",
  {
    id: id(),
    citizenId: text("citizen_id", { length: 36 })
      .notNull()
      .references(() => citizens.id, { onDelete: "cascade" }),
    telegramUserId: text("telegram_user_id", { length: 32 }).unique().notNull(),
    telegramUsername: text("telegram_username", { length: 64 }),
    firstName: text("first_name", { length: 64 }),
    lastName: text("last_name", { length: 64 }),
    languageCode: text("language_code", { length: 8 }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ telegram_accounts_citizen_idx: index("telegram_accounts_citizen_idx").on(t.citizenId) }),
);

export type Citizen = typeof citizens.$inferSelect;
export type NewCitizen = typeof citizens.$inferInsert;
export type TelegramAccount = typeof telegramAccounts.$inferSelect;
export type NewTelegramAccount = typeof telegramAccounts.$inferInsert;
