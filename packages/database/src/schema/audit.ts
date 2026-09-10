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

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: id(),
    actorKind: text("actor_kind", { length: 16 }).notNull(),
    actorId: text("actor_id", { length: 64 }).notNull(),
    action: text("action", { length: 80 }).notNull(),
    entityType: text("entity_type", { length: 40 }),
    entityId: text("entity_id", { length: 64 }),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
    ipAddress: text("ip_address", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => ({
    audit_events_actor_idx: index("audit_events_actor_idx").on(t.actorKind, t.actorId),
    audit_events_action_idx: index("audit_events_action_idx").on(t.action),
    audit_events_entity_idx: index("audit_events_entity_idx").on(t.entityType, t.entityId),
    audit_events_created_idx: index("audit_events_created_idx").on(t.createdAt),
  }),
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
