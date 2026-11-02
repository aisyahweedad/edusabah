import { z } from "zod";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  ROLES,
  SEVERITIES,
  type ComplaintCategory,
  type ComplaintStatus,
  type Severity,
} from "@k-aecs/shared";

const categoryEnum = z.enum(
  COMPLAINT_CATEGORIES as readonly [ComplaintCategory, ...ComplaintCategory[]],
);
const statusEnum = z.enum(
  COMPLAINT_STATUSES as readonly [ComplaintStatus, ...ComplaintStatus[]],
);
const severityEnum = z.enum(SEVERITIES as readonly [Severity, ...Severity[]]);

export const telegramId = z.coerce.string().trim().min(4).max(32);
export const phoneNumber = z
  .string()
  .trim()
  .regex(/^\+?\d{9,15}$/, "Invalid Malaysian phone number");

export const malaysianId = z
  .string()
  .trim()
  .regex(/^\d{12}$/, "Invalid Malaysian identification number (must be 12 digits)");

export const consentSchema = z.object({
  version: z.string().min(1),
  acceptedAt: z.coerce.date(),
  ipAddress: z.string().ip().optional(),
});

export const citizenProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneNumber.optional(),
  icNumber: malaysianId.optional(),
  districtCode: z.string().trim().min(1).max(10).optional(),
  institutionCode: z.string().trim().min(1).max(40).optional(),
});

export const complaintCreateSchema = z.object({
  category: categoryEnum,
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(20).max(4000),
  institutionCode: z.string().trim().min(1).max(40).optional(),
  districtCode: z.string().trim().min(1).max(10).optional(),
  location: z.string().trim().max(200).optional(),
  dateOfIncident: z.coerce.date().optional(),
  citizenName: z.string().trim().min(2).max(120).optional(),
  attachments: z.array(z.string().url()).max(5).default([]),
});

export const complaintReplySchema = z.object({
  content: z.string().trim().min(1).max(4000),
  isInternal: z.boolean().optional().default(false),
});

export const complaintUpdateStatusSchema = z.object({
  status: statusEnum,
  note: z.string().trim().max(4000).optional(),
});

export const complaintSeveritySchema = z.object({
  severity: severityEnum,
});

export const harnessRunSchema = z.object({
  actor: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("citizen"), telegramUserId: telegramId }),
    z.object({
      kind: z.literal("officer"),
      role: z.enum(ROLES),
      officerId: z.string().trim().min(1),
    }),
  ]),
  channelId: z.string().trim().min(1),
  message: z.string().trim().min(1).max(4000),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

export const officerCreateSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: z.string().trim().min(2).max(120),
  role: z.enum(ROLES),
});

export const knowledgeUpsertSchema = z.object({
  title: z.string().trim().min(3).max(300),
  category: z.string().trim().min(1).max(60).default("general"),
  markdown: z.string().trim().min(20).max(200_000),
  source: z.string().trim().url().optional().or(z.string().trim().max(20).optional()),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const complaintQuerySchema = paginationSchema.extend({
  status: statusEnum.optional(),
  category: categoryEnum.optional(),
  institutionCode: z.string().optional(),
  q: z.string().trim().max(300).optional(),
});
