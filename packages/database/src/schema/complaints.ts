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
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const complaints = sqliteTable(
  "complaints",
  {
    id: id(),
    referenceNumber: text("reference_number", { length: 40 }).unique().notNull(),
    citizenId: text("citizen_id", { length: 36 })
      .notNull()
      .references(() => citizens.id, { onDelete: "restrict" }),
    telegramUserId: text("telegram_user_id", { length: 32 }).notNull(),
    category: text("category", { length: 30 }).notNull(),
    title: text("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    institutionCode: text("institution_code", { length: 40 }),
    districtCode: text("district_code", { length: 10 }),
    location: text("location", { length: 200 }),
    dateOfIncident: integer("date_of_incident", { mode: "timestamp_ms" }),
    attachments: text("attachments", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    status: text("status", { length: 24 }).notNull().default("submitted"),
    assignedTo: text("assigned_to", { length: 36 }),
    assignedAt: integer("assigned_at", { mode: "timestamp_ms" }),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    resolutionSummary: text("resolution_summary"),
    aiAnalysis: text("ai_analysis", { mode: "json" }).$type<Record<string, unknown>>(),
    citations: text("citations", { mode: "json" })
      .$type<Citation[]>()
      .notNull()
      .$defaultFn(() => []),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    complaints_citizen_idx: index("complaints_citizen_idx").on(t.citizenId),
    complaints_status_idx: index("complaints_status_idx").on(t.status),
    complaints_category_idx: index("complaints_category_idx").on(t.category),
    complaints_district_idx: index("complaints_district_idx").on(t.districtCode),
    complaints_telegram_idx: index("complaints_telegram_idx").on(t.telegramUserId),
    complaints_created_idx: index("complaints_created_idx").on(t.createdAt),
  }),
);

export const complaintStatusHistory = sqliteTable(
  "complaint_status_history",
  {
    id: id(),
    complaintId: text("complaint_id", { length: 36 })
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    fromStatus: text("from_status", { length: 24 }),
    toStatus: text("to_status", { length: 24 }).notNull(),
    actorType: text("actor_type", { length: 16 }).notNull(),
    actorId: text("actor_id", { length: 64 }).notNull(),
    note: text("note"),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
    createdAt: createdAt(),
  },
  (t) => ({ complaint_history_complaint_idx: index("complaint_history_complaint_idx").on(t.complaintId) }),
);

export const complaintNotes = sqliteTable(
  "complaint_notes",
  {
    id: id(),
    complaintId: text("complaint_id", { length: 36 })
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    actorType: text("actor_type", { length: 16 }).notNull(),
    actorId: text("actor_id", { length: 64 }).notNull(),
    content: text("content").notNull(),
    isInternal: integer("is_internal", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => ({ complaint_notes_complaint_idx: index("complaint_notes_complaint_idx").on(t.complaintId) }),
);

export const complaintAttachments = sqliteTable(
  "complaint_attachments",
  {
    id: id(),
    complaintId: text("complaint_id", { length: 36 })
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    storageKey: text("storage_key", { length: 300 }).notNull(),
    fileName: text("file_name", { length: 200 }).notNull(),
    mimeType: text("mime_type", { length: 120 }),
    sizeBytes: integer("size_bytes"),
    uploadedBy: text("uploaded_by", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => ({ complaint_attachments_complaint_idx: index("complaint_attachments_complaint_idx").on(t.complaintId) }),
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    complaintId: text("complaint_id", { length: 36 }).references(() => complaints.id, {
      onDelete: "cascade",
    }),
    channel: text("channel", { length: 20 }).notNull().default("telegram"),
    recipientType: text("recipient_type", { length: 16 }).notNull(),
    recipientId: text("recipient_id", { length: 64 }).notNull(),
    templateKey: text("template_key", { length: 80 }).notNull(),
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
    status: text("status", { length: 24 }).notNull().default("pending"),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => ({
    notifications_recipient_idx: index("notifications_recipient_idx").on(t.recipientType, t.recipientId),
    notifications_status_idx: index("notifications_status_idx").on(t.status),
  }),
);

export type Complaint = typeof complaints.$inferSelect;
export type NewComplaint = typeof complaints.$inferInsert;
export type ComplaintStatusHistory = typeof complaintStatusHistory.$inferSelect;
export type ComplaintNote = typeof complaintNotes.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
