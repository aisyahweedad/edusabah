import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, asc, eq, gte, inArray, like, lte, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as XLSX from "xlsx";
import { getDb } from "@k-aecs/database";
import {
  aiRuns,
  aiToolCalls,
  auditEvents,
  complaints,
  complaintStatusHistory,
  notifications,
  officers,
} from "@k-aecs/database/schema";
import { buildInsightsPrompt, runHarness } from "@k-aecs/harness";
import { isOverdue, type Role } from "@k-aecs/shared";
import type { ComplaintInsightData } from "@k-aecs/tools";
import { authorize, resolveSession } from "../lib/auth.js";
import { sendError } from "../lib/http.js";
import { notifyCitizenOfComplaintUpdate } from "../lib/citizen-notify.js";

const askSchema = z.object({
  question: z.string().trim().min(3).max(500),
  conversationId: z.string().trim().max(140).optional(),
});

const exportSchema = z.object({
  format: z.enum(["csv", "xlsx", "pdf"]),
  title: z.string().trim().min(1).max(200).default("EduSabah Insights"),
  columns: z
    .array(z.object({ key: z.string().min(1).max(80), label: z.string().min(1).max(120) }))
    .min(1)
    .max(20),
  rows: z.array(z.record(z.unknown())).max(2000),
});

const filterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.array(z.string()).optional(),
  category: z.array(z.string()).optional(),
  severity: z.array(z.string()).optional(),
  districtCode: z.array(z.string()).optional(),
  search: z.string().optional(),
});

const escalateSchema = z.object({
  filters: filterSchema.default({}),
  groupBy: z.string().optional(),
  key: z.string().optional(),
  label: z.string().optional(),
});

interface InsightSuggestion {
  id: string;
  title: string;
  description: string;
  action:
    | { type: "navigate"; href: string }
    | {
        type: "escalate";
        groupBy?: string;
        key?: string;
        label?: string;
        filters: z.infer<typeof filterSchema>;
      };
}

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function complaintConditions(
  filters: z.infer<typeof filterSchema>,
  dimension?: { groupBy?: string; key?: string },
): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.status?.length) conditions.push(inArray(complaints.status, filters.status));
  if (filters.category?.length) conditions.push(inArray(complaints.category, filters.category));
  if (filters.severity?.length) conditions.push(inArray(complaints.severity, filters.severity));
  if (filters.districtCode?.length) {
    conditions.push(inArray(complaints.districtCode, filters.districtCode));
  }
  const from = parseDate(filters.from);
  const to = parseDate(filters.to, true);
  if (from) conditions.push(gte(complaints.createdAt, from));
  if (to) conditions.push(lte(complaints.createdAt, to));
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    const search = or(
      like(complaints.referenceNumber, term),
      like(complaints.title, term),
      like(complaints.description, term),
    );
    if (search) conditions.push(search);
  }
  if (dimension?.key) {
    switch (dimension.groupBy) {
      case "district":
        conditions.push(eq(complaints.districtCode, dimension.key));
        break;
      case "category":
        conditions.push(eq(complaints.category, dimension.key));
        break;
      case "status":
        conditions.push(eq(complaints.status, dimension.key));
        break;
      case "severity":
        conditions.push(eq(complaints.severity, dimension.key));
        break;
      default:
        break;
    }
  }
  return conditions.length ? and(...conditions) : undefined;
}

function suggestionHref(
  filters: z.infer<typeof filterSchema>,
  dimension?: { groupBy?: string; key?: string },
): string {
  const params = new URLSearchParams();
  if (filters.status?.[0]) params.set("status", filters.status[0]);
  if (filters.category?.[0]) params.set("category", filters.category[0]);
  if (filters.severity?.[0]) params.set("severity", filters.severity[0]);
  if (filters.districtCode?.[0]) params.set("district", filters.districtCode[0]);
  if (filters.search?.trim()) params.set("q", filters.search.trim());
  if (dimension?.key) {
    if (dimension.groupBy === "district") params.set("district", dimension.key);
    if (dimension.groupBy === "category") params.set("category", dimension.key);
    if (dimension.groupBy === "status") params.set("status", dimension.key);
    if (dimension.groupBy === "severity") params.set("severity", dimension.key);
  }
  const qs = params.toString();
  return `/complaints${qs ? `?${qs}` : ""}`;
}

function buildSuggestions(
  data: ComplaintInsightData,
  permissions: string[],
): InsightSuggestion[] {
  const suggestions: InsightSuggestion[] = [
    {
      id: "view-matching",
      title: "Lihat aduan yang sepadan",
      description: "Buka senarai aduan dengan tapisan yang sama.",
      action: { type: "navigate", href: suggestionHref(data.filters) },
    },
  ];

  const top = data.rows[0];
  if (!top) return suggestions;

  const canEscalate = permissions.includes("complaint:escalate");
  if (["district", "category", "status", "severity"].includes(data.groupBy)) {
    const dimension = { groupBy: data.groupBy, key: top.key };
    suggestions.push({
      id: `focus-${top.key}`,
      title: `Tapis ke ${top.label}`,
      description: `Lihat hanya aduan dalam kumpulan tertinggi (${top.value}).`,
      action: { type: "navigate", href: suggestionHref(data.filters, dimension) },
    });

    if (canEscalate && ["district", "category", "severity"].includes(data.groupBy)) {
      suggestions.push({
        id: `escalate-${top.key}`,
        title: `Eskalasi aduan tertunggak di ${top.label}`,
        description:
          "Hanya aduan terbuka yang telah melebihi SLA akan dinaikkan tahap ke Setiausaha Politik.",
        action: {
          type: "escalate",
          groupBy: data.groupBy,
          key: top.key,
          label: top.label,
          filters: data.filters,
        },
      });
    }
  } else if (canEscalate && data.groupBy === "none") {
    suggestions.push({
      id: "escalate-all-overdue",
      title: "Eskalasi semua aduan tertunggak",
      description:
        "Naikkan tahap aduan terbuka yang melebihi SLA untuk keseluruhan tapisan ini.",
      action: {
        type: "escalate",
        filters: data.filters,
      },
    });
  }

  return suggestions;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function filenameFor(title: string, extension: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "edusabah-insights";
  return `${base}.${extension}`;
}

async function buildPdf(
  title: string,
  columns: Array<{ key: string; label: string }>,
  rows: Array<Record<string, unknown>>,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 40;
  const rowHeight = 18;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const usableWidth = pageWidth - margin * 2;
  const colWidth = usableWidth / columns.length;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  page.drawText(title, { x: margin, y, size: 16, font: bold, color: rgb(0.1, 0.15, 0.25) });
  y -= 26;
  page.drawText(`Dijana: ${new Date().toLocaleString("ms-MY", { timeZone: "Asia/Kuching" })}`, {
    x: margin,
    y,
    size: 9,
    font,
    color: rgb(0.4, 0.45, 0.55),
  });
  y -= 24;

  const drawHeader = () => {
    columns.forEach((column, index) => {
      page.drawText(column.label.slice(0, 28), {
        x: margin + index * colWidth,
        y,
        size: 9,
        font: bold,
        color: rgb(0.1, 0.15, 0.25),
      });
    });
    y -= 14;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.8,
      color: rgb(0.75, 0.8, 0.87),
    });
    y -= 12;
  };

  const truncate = (text: string, maxWidth: number, size: number): string => {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let result = text;
    while (result.length > 1 && font.widthOfTextAtSize(`${result}…`, size) > maxWidth) {
      result = result.slice(0, -1);
    }
    return `${result}…`;
  };

  drawHeader();
  for (const row of rows) {
    if (y < margin + rowHeight) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      drawHeader();
    }
    columns.forEach((column, index) => {
      const text = truncate(String(row[column.label] ?? row[column.key] ?? ""), colWidth - 6, 8);
      page.drawText(text, {
        x: margin + index * colWidth,
        y,
        size: 8,
        font,
        color: rgb(0.15, 0.18, 0.24),
      });
    });
    y -= rowHeight;
  }

  return Buffer.from(await doc.save());
}

export async function insightsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", resolveSession);

  app.post(
    "/insights/ask",
    { preHandler: [authorize("analytics:view")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = askSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, parsed.error);
      const session = request.officerSession!;
      const legacy = `insights:${session.sub}`;
      const prefix = `${legacy}:`;
      const conversationId = parsed.data.conversationId ?? `${prefix}${randomUUID()}`;
      if (conversationId !== legacy && !conversationId.startsWith(prefix)) {
        return reply.code(403).send({ error: "FORBIDDEN", message: "Invalid conversation" });
      }

      const db = getDb();
      const previous = await db
        .select({
          userMessage: aiRuns.userMessage,
          assistantText: aiRuns.assistantText,
          createdAt: aiRuns.createdAt,
        })
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.conversationId, conversationId),
            eq(aiRuns.actorKind, "officer"),
            eq(aiRuns.actorId, session.sub),
            eq(aiRuns.intent, "insights"),
          ),
        )
        .orderBy(asc(aiRuns.createdAt))
        .limit(20);

      const history = previous.flatMap((run) => [
        { role: "user" as const, content: run.userMessage },
        ...(run.assistantText
          ? [{ role: "assistant" as const, content: run.assistantText }]
          : []),
      ]);

      let captured: ComplaintInsightData | undefined;
      const result = await runHarness({
        userMessage: parsed.data.question,
        actor: {
          actorKind: "officer",
          actorId: session.sub,
          role: session.role as Role,
          capture: (name, data) => {
            if (name === "query_complaints") captured = data as ComplaintInsightData;
          },
        },
        conversationId,
        channelId: "web",
        intent: "insights",
        systemPrompt: buildInsightsPrompt(),
        history,
      });

      const data = captured ?? null;
      const suggestions = data ? buildSuggestions(data, session.permissions) : [];
      try {
        await db
          .update(aiRuns)
          .set({ payload: { data, suggestions } })
          .where(eq(aiRuns.id, result.runId));
      } catch (error) {
        app.log.error({ err: error }, "failed to persist insights payload");
      }

      return reply.send({
        status: result.status,
        answer: result.text,
        data,
        suggestions,
        conversationId,
        runId: result.runId,
        usage: result.usage,
        error: result.error,
      });
    },
  );

  app.get(
    "/insights/chats",
    { preHandler: [authorize("analytics:view")] },
    async (request: FastifyRequest) => {
      const session = request.officerSession!;
      const db = getDb();
      const rows = await db
        .select({
          conversationId: aiRuns.conversationId,
          userMessage: aiRuns.userMessage,
          createdAt: aiRuns.createdAt,
        })
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.actorKind, "officer"),
            eq(aiRuns.actorId, session.sub),
            eq(aiRuns.intent, "insights"),
          ),
        )
        .orderBy(asc(aiRuns.createdAt))
        .limit(1000);

      const chats = new Map<
        string,
        {
          id: string;
          title: string;
          questions: number;
          lastActivityAt: string;
          lastQuestion: string;
        }
      >();
      for (const row of rows) {
        if (!row.conversationId) continue;
        const existing = chats.get(row.conversationId);
        if (!existing) {
          chats.set(row.conversationId, {
            id: row.conversationId,
            title: row.userMessage.slice(0, 120),
            questions: 1,
            lastActivityAt: row.createdAt.toISOString(),
            lastQuestion: row.userMessage,
          });
        } else {
          existing.questions += 1;
          existing.lastActivityAt = row.createdAt.toISOString();
          existing.lastQuestion = row.userMessage;
        }
      }

      return {
        chats: [...chats.values()].sort((a, b) =>
          b.lastActivityAt.localeCompare(a.lastActivityAt),
        ),
      };
    },
  );

  app.get(
    "/insights/chats/:id",
    { preHandler: [authorize("analytics:view")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = request.officerSession!;
      const legacy = `insights:${session.sub}`;
      const prefix = `${legacy}:`;
      const id = decodeURIComponent((request.params as { id: string }).id);
      if (id !== legacy && !id.startsWith(prefix)) {
        return reply.code(403).send({ error: "FORBIDDEN", message: "Invalid conversation" });
      }
      const db = getDb();
      const rows = await db
        .select()
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.conversationId, id),
            eq(aiRuns.actorKind, "officer"),
            eq(aiRuns.actorId, session.sub),
            eq(aiRuns.intent, "insights"),
          ),
        )
        .orderBy(asc(aiRuns.createdAt));
      if (!rows.length) {
        return reply.code(404).send({ error: "NOT_FOUND", message: "Chat not found" });
      }
      return {
        chat: {
          id,
          title: rows[0]!.userMessage.slice(0, 120),
          createdAt: rows[0]!.createdAt,
        },
        messages: rows.map((row) => ({
          id: row.id,
          question: row.userMessage,
          answer: row.assistantText,
          payload: row.payload,
          createdAt: row.createdAt,
        })),
      };
    },
  );

  app.delete(
    "/insights/chats/:id",
    { preHandler: [authorize("analytics:view")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = request.officerSession!;
      const legacy = `insights:${session.sub}`;
      const prefix = `${legacy}:`;
      const id = decodeURIComponent((request.params as { id: string }).id);
      if (id !== legacy && !id.startsWith(prefix)) {
        return reply.code(403).send({ error: "FORBIDDEN", message: "Invalid conversation" });
      }
      const db = getDb();
      const runs = await db
        .select({ id: aiRuns.id })
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.conversationId, id),
            eq(aiRuns.actorKind, "officer"),
            eq(aiRuns.actorId, session.sub),
            eq(aiRuns.intent, "insights"),
          ),
        );
      if (!runs.length) {
        return reply.code(404).send({ error: "NOT_FOUND", message: "Chat not found" });
      }
      const ids = runs.map((run) => run.id);
      await db.delete(aiToolCalls).where(inArray(aiToolCalls.runId, ids));
      await db.delete(aiRuns).where(inArray(aiRuns.id, ids));
      return { deleted: ids.length };
    },
  );

  app.post(
    "/insights/export",
    { preHandler: [authorize("analytics:view")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = exportSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, parsed.error);
      const { format, title, columns, rows } = parsed.data;
      const data = rows.map((row) =>
        Object.fromEntries(columns.map((column) => [column.label, row[column.key] ?? ""])),
      );

      if (format === "csv") {
        const header = columns.map((column) => csvEscape(column.label)).join(",");
        const body = data
          .map((row) => columns.map((column) => csvEscape(row[column.label])).join(","))
          .join("\n");
        return reply
          .header("content-type", "text/csv; charset=utf-8")
          .header("content-disposition", `attachment; filename="${filenameFor(title, "csv")}"`)
          .send(`\uFEFF${header}\n${body}\n`);
      }

      if (format === "xlsx") {
        const sheet = XLSX.utils.json_to_sheet(data, {
          header: columns.map((column) => column.label),
        });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, "Insights");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        return reply
          .header(
            "content-type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          )
          .header("content-disposition", `attachment; filename="${filenameFor(title, "xlsx")}"`)
          .send(Buffer.from(buffer));
      }

      const pdf = await buildPdf(title, columns, data);
      return reply
        .header("content-type", "application/pdf")
        .header("content-disposition", `attachment; filename="${filenameFor(title, "pdf")}"`)
        .send(pdf);
    },
  );

  app.post(
    "/insights/actions/escalate",
    { preHandler: [authorize("complaint:escalate")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = escalateSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, parsed.error);
      const session = request.officerSession!;
      const db = getDb();
      const where = complaintConditions(parsed.data.filters, {
        groupBy: parsed.data.groupBy,
        key: parsed.data.key,
      });
      const rows = await db.select().from(complaints).where(where).limit(500);
      const targets = rows.filter(
        (complaint) =>
          complaint.status !== "escalated" && isOverdue(complaint.createdAt, complaint.severity, complaint.status),
      );

      if (!targets.length) return { escalated: 0, references: [] };

      const secretaries = await db
        .select({ id: officers.id })
        .from(officers)
        .where(and(eq(officers.role, "political_secretary"), eq(officers.isActive, true)));

      for (const complaint of targets) {
        await db
          .update(complaints)
          .set({ status: "escalated", updatedAt: new Date() })
          .where(eq(complaints.id, complaint.id));
        await db.insert(complaintStatusHistory).values({
          complaintId: complaint.id,
          fromStatus: complaint.status,
          toStatus: "escalated",
          actorType: "officer",
          actorId: session.sub,
          note: "Auto-escalated from AI insights",
        });
        await db.insert(auditEvents).values({
          actorKind: "officer",
          actorId: session.sub,
          action: "complaint.escalated",
          entityType: "complaint",
          entityId: complaint.id,
          metadata: {
            referenceNumber: complaint.referenceNumber,
            source: "insights",
            groupBy: parsed.data.groupBy,
            groupLabel: parsed.data.label,
          },
        });
        for (const secretary of secretaries) {
          await db.insert(notifications).values({
            complaintId: complaint.id,
            channel: "in_app",
            recipientType: "political_secretary",
            recipientId: secretary.id,
            templateKey: "complaint.escalated",
            payload: {
              referenceNumber: complaint.referenceNumber,
              title: complaint.title,
              source: "insights",
            },
            status: "pending",
          });
        }
        notifyCitizenOfComplaintUpdate({
          complaintId: complaint.id,
          telegramUserId: complaint.telegramUserId,
          referenceNumber: complaint.referenceNumber,
          title: complaint.title,
          status: "escalated",
          templateKey: "complaint.escalated",
          headline: "⚠️ <b>Aduan Dinaikkan Tahap</b>",
        });
      }

      return {
        escalated: targets.length,
        references: targets.map((complaint) => complaint.referenceNumber),
      };
    },
  );
}
