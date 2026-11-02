import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "@k-aecs/database";
import {
  auditEvents,
  citizens,
  complaints,
  complaintNotes,
  complaintStatusHistory,
  districts,
  notifications,
  officers,
} from "@k-aecs/database/schema";
import {
  isOverdue,
  slaHoursFor,
} from "@k-aecs/shared";
import {
  complaintCreateSchema,
  complaintQuerySchema,
  complaintReplySchema,
  complaintSeveritySchema,
  complaintUpdateStatusSchema,
} from "@k-aecs/validation";
import { authorize, resolveSession } from "../lib/auth.js";
import { CATEGORY_UNIT, runIntakePipeline } from "@k-aecs/intake";
import { sendError } from "../lib/http.js";
import { notifyCitizenOfComplaintUpdate } from "../lib/citizen-notify.js";

/** Best-effort audit writer for citizen-side events (UC-03 enquiry logging). */
async function writeAuditEvent(
  db: ReturnType<typeof getDb>,
  entry: {
    actorKind: string;
    actorId: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      actorKind: entry.actorKind,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ?? {},
    });
  } catch (error) {
    console.error("[complaints] audit write failed", error);
  }
}

function referenceNumber(year: number, seq: number): string {
  return `KPSTI-${year}-${String(seq).padStart(6, "0")}`;
}

async function nextReferenceNumber(db: ReturnType<typeof getDb>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `KPSTI-${year}-%`;
  // Max over the padded sequence avoids the count+1 race (deleted rows,
  // concurrent inserts) that would produce duplicate keys.
  const [row] = await db
    .select({
      maxSeq: sql<number>`coalesce(max(cast(substr(${complaints.referenceNumber}, -6) as integer)), 0)`,
    })
    .from(complaints)
    .where(like(complaints.referenceNumber, prefix));
  return referenceNumber(year, (row?.maxSeq ?? 0) + 1);
}

export async function complaintRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", resolveSession);

  // List complaints — officers only (citizens reach their own via the bot).
  app.get(
    "/complaints",
    { preHandler: [authorize("complaint:view")] },
    async (request, reply) => {
      const qp = complaintQuerySchema.safeParse(request.query);
      if (!qp.success) return sendError(reply, qp.error);
      const { page, pageSize, status, category, severity, districtCode, q } = qp.data;
      const db = getDb();
      const conditions = [
        status ? eq(complaints.status, status) : undefined,
        category ? eq(complaints.category, category) : undefined,
        severity ? eq(complaints.severity, severity) : undefined,
        districtCode ? eq(complaints.districtCode, districtCode) : undefined,
        q
          ? or(
              like(complaints.referenceNumber, `%${q}%`),
              like(sql<string>`lower(${complaints.title})`, `%${q.toLowerCase()}%`),
              like(sql<string>`lower(${complaints.description})`, `%${q.toLowerCase()}%`),
            )
          : undefined,
      ].filter(Boolean);
      const where = conditions.length ? and(...(conditions as [any])) : undefined;
      const rows = await db
        .select()
        .from(complaints)
        .where(where)
        .orderBy(sql`${complaints.createdAt} desc`)
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      return { complaints: rows, page, pageSize };
    },
  );

  // Citizen-initiated complaint intake. `telegramUserId` identifies the owner.
  app.post("/complaints", async (request, reply) => {
    const parsed = complaintCreateSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, parsed.error);
    const telegramUserId = (request.headers["x-telegram-user-id"] as string | undefined)?.trim();
    if (!telegramUserId) {
      return reply
        .code(400)
        .send({ error: "MISSING_OWNER", message: "x-telegram-user-id header is required" });
    }
    const values = parsed.data;
    const db = getDb();
    const [citizen] = await db
      .select({ id: citizens.id })
      .from(citizens)
      .where(sql`${citizens.createdBy} = ${`tg:${telegramUserId}`}`)
      .limit(1);
    const citizenId = citizen?.id ?? (await ensureCitizen(db, telegramUserId));

    const referenceNumber = await nextReferenceNumber(db);
    const [created] = await db
      .insert(complaints)
      .values({
        referenceNumber,
        citizenId,
        telegramUserId,
        category: values.category,
        title: values.title,
        description: values.description,
        institutionCode: values.institutionCode,
        districtCode: values.districtCode,
        location: values.location,
        dateOfIncident: values.dateOfIncident ? new Date(values.dateOfIncident) : undefined,
        attachments: values.attachments,
      })
      .returning();
    if (!created) {
      return reply.code(500).send({ error: "INSERT_FAILED", message: "Complaint could not be created" });
    }

    await db.insert(complaintStatusHistory).values({
      complaintId: created.id,
      toStatus: created.status,
      actorType: "citizen",
      actorId: telegramUserId,
    });

    // UC-02 post-intake pipeline: classify, dedupe, audit, notify, escalate.
    // Runs inline (awaited) so the citizen acknowledgement reflects reality;
    // internally every step is best-effort and cannot fail the request.
    const outcome = await runIntakePipeline(
      {
        complaintId: created.id,
        referenceNumber: created.referenceNumber,
        telegramUserId,
        category: created.category,
        title: created.title,
        description: created.description,
        location: created.location,
        districtCode: created.districtCode,
      },
      citizenId,
      app.log,
    );

    const [fresh] = await db.select().from(complaints).where(eq(complaints.id, created.id)).limit(1);

    return reply.code(201).send({
      complaint: fresh ?? created,
      analysis: {
        severity: outcome.analysis.severity,
        sentiment: outcome.analysis.sentiment,
        priorityScore: outcome.analysis.priorityScore,
        duplicateOf: outcome.duplicateRef,
        escalated: outcome.escalated,
      },
    });
  });

  // Citizen self-service lookup by reference number (UC-03). Ownership is
  // enforced via the x-telegram-user-id header, matching the complaint's
  // owner — no officer permission is required and no other complaint's data
  // is returned. Every enquiry is logged for audit and analytics.
  app.get("/complaints/by-ref/:reference", async (request, reply) => {
    const reference = (request.params as { reference: string }).reference.trim().toUpperCase();
    const telegramUserId = (request.headers["x-telegram-user-id"] as string | undefined)?.trim();
    if (!telegramUserId) {
      return reply.code(400).send({ error: "MISSING_OWNER", message: "x-telegram-user-id header is required" });
    }
    const db = getDb();
    const [complaint] = await db
      .select()
      .from(complaints)
      .where(eq(complaints.referenceNumber, reference))
      .limit(1);
    if (!complaint) {
      await writeAuditEvent(db, {
        actorKind: "citizen",
        actorId: telegramUserId,
        action: "status.enquiry",
        entityType: "complaint",
        metadata: { reference, outcome: "not_found" },
      });
      return reply.code(404).send({ error: "NOT_FOUND", message: "Complaint not found" });
    }
    if (complaint.telegramUserId !== telegramUserId) {
      await writeAuditEvent(db, {
        actorKind: "citizen",
        actorId: telegramUserId,
        action: "status.enquiry",
        entityType: "complaint",
        entityId: complaint.id,
        metadata: { reference, outcome: "not_owner" },
      });
      return reply.code(403).send({ error: "NOT_YOURS", message: "This reference does not belong to you" });
    }

    const notes = await db
      .select({ id: complaintNotes.id, content: complaintNotes.content, createdAt: complaintNotes.createdAt })
      .from(complaintNotes)
      .where(and(eq(complaintNotes.complaintId, complaint.id), sql`${complaintNotes.isInternal} = false`))
      .orderBy(sql`${complaintNotes.createdAt} desc`)
      .limit(20);

    const history = await db
      .select({
        id: complaintStatusHistory.id,
        fromStatus: complaintStatusHistory.fromStatus,
        toStatus: complaintStatusHistory.toStatus,
        createdAt: complaintStatusHistory.createdAt,
      })
      .from(complaintStatusHistory)
      .where(eq(complaintStatusHistory.complaintId, complaint.id))
      .orderBy(sql`${complaintStatusHistory.createdAt} asc`);

    // UC-03: overdue evaluation against the severity SLA.
    const overdue = isOverdue(complaint.createdAt, complaint.severity, complaint.status);

    // Responsible unit/officer contact for the citizen (UC-03 "Show
    // Responsible Unit"). Only minimal, non-identifying info is exposed.
    let responsibleUnit: string | undefined;
    let responsibleOfficer: string | undefined;
    if (complaint.assignedTo) {
      const [assignee] = await db
        .select({ name: officers.name, role: officers.role })
        .from(officers)
        .where(eq(officers.id, complaint.assignedTo))
        .limit(1);
      if (assignee) {
        responsibleOfficer = assignee.name;
        responsibleUnit = CATEGORY_UNIT[complaint.category] ?? "Triage";
      }
    } else {
      responsibleUnit = CATEGORY_UNIT[complaint.category] ?? "Triage";
    }

    await writeAuditEvent(db, {
      actorKind: "citizen",
      actorId: telegramUserId,
      action: "status.enquiry",
      entityType: "complaint",
      entityId: complaint.id,
      metadata: { reference, outcome: "ok", overdue },
    });

    return reply.send({
      complaint,
      notes,
      history,
      tracking: {
        overdue,
        slaHours: slaHoursFor(complaint.severity),
        offerEscalation: overdue,
        responsibleUnit,
        responsibleOfficer,
        resolutionSummary: complaint.status === "closed" || complaint.status === "resolved"
          ? complaint.resolutionSummary
          : undefined,
      },
    });
  });

  // UC-03: citizen-triggered escalation of their own overdue complaint.
  app.post(
    "/complaints/by-ref/:reference/escalate",
    async (request, reply) => {
      const reference = (request.params as { reference: string }).reference.trim().toUpperCase();
      const telegramUserId = (request.headers["x-telegram-user-id"] as string | undefined)?.trim();
      if (!telegramUserId) {
        return reply.code(400).send({ error: "MISSING_OWNER", message: "x-telegram-user-id header is required" });
      }
      const db = getDb();
      const [complaint] = await db
        .select()
        .from(complaints)
        .where(eq(complaints.referenceNumber, reference))
        .limit(1);
      if (!complaint || complaint.telegramUserId !== telegramUserId) {
        return reply.code(403).send({ error: "NOT_YOURS", message: "This reference does not belong to you" });
      }
      const terminal = complaint.status === "closed" || complaint.status === "resolved" || complaint.status === "rejected";
      if (terminal) {
        return reply.code(400).send({ error: "NOT_ESCALABLE", message: "Closed complaints cannot be escalated" });
      }
      if (complaint.status === "escalated") {
        return reply.send({ complaint, alreadyEscalated: true });
      }
      if (!isOverdue(complaint.createdAt, complaint.severity, complaint.status)) {
        return reply.code(400).send({
          error: "NOT_OVERDUE",
          message: "Aduan belum melebihi masa sasaran. Sila tunggu sehingga tempoh sasaran tamat.",
        });
      }

      const [updated] = await db
        .update(complaints)
        .set({ status: "escalated", updatedAt: new Date() })
        .where(eq(complaints.id, complaint.id))
        .returning();

      await db.insert(complaintStatusHistory).values({
        complaintId: complaint.id,
        fromStatus: complaint.status,
        toStatus: "escalated",
        actorType: "citizen",
        actorId: telegramUserId,
        note: "Escalated by citizen (overdue)",
        metadata: { reference: complaint.referenceNumber },
      });
      await writeAuditEvent(db, {
        actorKind: "citizen",
        actorId: telegramUserId,
        action: "complaint.escalated",
        entityType: "complaint",
        entityId: complaint.id,
        metadata: { reference: complaint.referenceNumber, source: "citizen_overdue" },
      });

      // Notify all political secretaries about the citizen escalation.
      const secretaries = await db
        .select({ id: officers.id })
        .from(officers)
        .where(and(eq(officers.role, "political_secretary"), eq(officers.isActive, true)));
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
            reason: "citizen escalation (overdue)",
          },
          status: "pending",
        });
      }

      return reply.send({ complaint: updated });
    },
  );

  app.get(
    "/complaints/:id",
    { preHandler: [authorize("complaint:view")] },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const db = getDb();
      const [complaint] = await db
        .select()
        .from(complaints)
        .where(eq(complaints.id, id))
        .limit(1);
      if (!complaint) return { error: "NOT_FOUND", message: "Complaint not found" };
      const notes = await db
        .select()
        .from(complaintNotes)
        .where(eq(complaintNotes.complaintId, id))
        .orderBy(sql`${complaintNotes.createdAt} desc`)
        .limit(50);
      const history = await db
        .select()
        .from(complaintStatusHistory)
        .where(eq(complaintStatusHistory.complaintId, id))
        .orderBy(sql`${complaintStatusHistory.createdAt} desc`);
      return { complaint, notes, history };
    },
  );

  app.post(
    "/complaints/:id/notes",
    { preHandler: [authorize("complaint:note")] },
    async (request, reply) => {
      const parsed = complaintReplySchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, parsed.error);
      const id = (request.params as { id: string }).id;
      const db = getDb();
      const [exists] = await db.select().from(complaints).where(eq(complaints.id, id)).limit(1);
      if (!exists) return reply.code(404).send({ error: "NOT_FOUND", message: "Complaint not found" });
      const [note] = await db
        .insert(complaintNotes)
        .values({
          complaintId: id,
          actorType: "officer",
          actorId: request.officerSession!.sub,
          content: parsed.data.content,
          isInternal: parsed.data.isInternal,
        })
        .returning();

      if (!parsed.data.isInternal) {
        notifyCitizenOfComplaintUpdate({
          complaintId: id,
          telegramUserId: exists.telegramUserId,
          referenceNumber: exists.referenceNumber,
          title: exists.title,
          status: exists.status,
          note: parsed.data.content,
          templateKey: "complaint.note",
          headline: "💬 <b>Nota Baharu</b>",
        });
      }

      return reply.code(201).send({ note });
    },
  );

  app.patch(
    "/complaints/:id/status",
    { preHandler: [authorize("complaint:update_status")] },
    async (request, reply) => {
      const parsed = complaintUpdateStatusSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, parsed.error);
      const id = (request.params as { id: string }).id;
      const db = getDb();
      const [existing] = await db
        .select()
        .from(complaints)
        .where(eq(complaints.id, id))
        .limit(1);
      if (!existing) return reply.code(404).send({ error: "NOT_FOUND", message: "Complaint not found" });

      if (parsed.data.status === "closed" && !request.officerSession!.permissions.includes("complaint:close")) {
        return reply.code(403).send({ error: "FORBIDDEN", message: "complaint:close required" });
      }

      const [updated] = await db
        .update(complaints)
        .set({
          status: parsed.data.status,
          closedAt:
            parsed.data.status === "closed" ? new Date() : existing.closedAt,
          resolvedAt:
            parsed.data.status === "resolved" && !existing.resolvedAt ? new Date() : existing.resolvedAt,
          resolutionSummary:
            (parsed.data.status === "resolved" || parsed.data.status === "closed") && parsed.data.note
              ? parsed.data.note
              : existing.resolutionSummary,
        })
        .where(eq(complaints.id, id))
        .returning();

      await db.insert(complaintStatusHistory).values({
        complaintId: id,
        fromStatus: existing.status,
        toStatus: parsed.data.status,
        actorType: "officer",
        actorId: request.officerSession!.sub,
        note: parsed.data.note,
      });

      if (parsed.data.note) {
        await db.insert(complaintNotes).values({
          complaintId: id,
          actorType: "officer",
          actorId: request.officerSession!.sub,
          content: parsed.data.note,
          isInternal: false,
        });
      }

      if (updated && (existing.status !== updated.status || parsed.data.note)) {
        notifyCitizenOfComplaintUpdate({
          complaintId: id,
          telegramUserId: existing.telegramUserId,
          referenceNumber: existing.referenceNumber,
          title: existing.title,
          status: updated.status,
          note: parsed.data.note,
          templateKey: "complaint.status_changed",
        });
      }

      return { complaint: updated };
    },
  );

  // Officer override of the AI-proposed severity.
  app.patch(
    "/complaints/:id/severity",
    { preHandler: [authorize("complaint:update_status")] },
    async (request, reply) => {
      const parsed = complaintSeveritySchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, parsed.error);
      const id = (request.params as { id: string }).id;
      const db = getDb();
      const [existing] = await db.select().from(complaints).where(eq(complaints.id, id)).limit(1);
      if (!existing) return reply.code(404).send({ error: "NOT_FOUND", message: "Complaint not found" });

      const [updated] = await db
        .update(complaints)
        .set({ severity: parsed.data.severity, updatedAt: new Date() })
        .where(eq(complaints.id, id))
        .returning();

      await db.insert(auditEvents).values({
        actorKind: "officer",
        actorId: request.officerSession!.sub,
        action: "complaint.severity_override",
        entityType: "complaint",
        entityId: id,
        metadata: {
          from: existing.severity,
          to: parsed.data.severity,
          referenceNumber: existing.referenceNumber,
        },
      });

      return { complaint: updated };
    },
  );

  // Assignment to an officer (supervisor / admin capability).
  app.patch(
    "/complaints/:id/assign",
    { preHandler: [authorize("complaint:assign")] },
    async (request, reply) => {
      const body = (request.body ?? {}) as { assigneeId?: string };
      const id = (request.params as { id: string }).id;
      const db = getDb();
      const [existing] = await db.select().from(complaints).where(eq(complaints.id, id)).limit(1);
      if (!existing) return reply.code(404).send({ error: "NOT_FOUND", message: "Complaint not found" });

      let assigneeId = body.assigneeId?.trim();
      if (assigneeId) {
        const [assignee] = await db
          .select({ id: officers.id, isActive: officers.isActive })
          .from(officers)
          .where(eq(officers.id, assigneeId))
          .limit(1);
        if (!assignee?.isActive) {
          return reply.code(400).send({ error: "BAD_ASSIGNEE", message: "Assignee not found or inactive" });
        }
      } else {
        assigneeId = request.officerSession!.sub;
      }

      const [updated] = await db
        .update(complaints)
        .set({
          assignedTo: assigneeId,
          assignedAt: new Date(),
          status: existing.status === "submitted" ? "assigned" : existing.status,
          updatedAt: new Date(),
        })
        .where(eq(complaints.id, id))
        .returning();

      await db.insert(complaintStatusHistory).values({
        complaintId: id,
        fromStatus: existing.status,
        toStatus: updated!.status,
        actorType: "officer",
        actorId: request.officerSession!.sub,
        note: `Assigned to officer ${assigneeId}`,
      });
      await db.insert(auditEvents).values({
        actorKind: "officer",
        actorId: request.officerSession!.sub,
        action: "complaint.assigned",
        entityType: "complaint",
        entityId: id,
        metadata: { assigneeId, referenceNumber: existing.referenceNumber },
      });

      await recordNotification(db, {
        complaintId: id,
        recipientType: "officer",
        recipientId: assigneeId!,
        templateKey: "complaint.assigned",
        payload: { referenceNumber: existing.referenceNumber, title: existing.title },
      });

      if (updated && existing.status !== updated.status) {
        notifyCitizenOfComplaintUpdate({
          complaintId: id,
          telegramUserId: existing.telegramUserId,
          referenceNumber: existing.referenceNumber,
          title: existing.title,
          status: updated.status,
          templateKey: "complaint.assigned",
          headline: "👤 <b>Aduan Ditugaskan</b>",
        });
      }

      return { complaint: updated };
    },
  );

  // Explicit escalation (Political Secretary or supervisors/admins).
  app.patch(
    "/complaints/:id/escalate",
    { preHandler: [authorize("complaint:escalate")] },
    async (request, reply) => {
      const body = (request.body ?? {}) as { note?: string };
      const id = (request.params as { id: string }).id;
      const db = getDb();
      const [existing] = await db.select().from(complaints).where(eq(complaints.id, id)).limit(1);
      if (!existing) return reply.code(404).send({ error: "NOT_FOUND", message: "Complaint not found" });
      if (existing.status === "escalated") return { complaint: existing };

      const [updated] = await db
        .update(complaints)
        .set({ status: "escalated", updatedAt: new Date() })
        .where(eq(complaints.id, id))
        .returning();

      await db.insert(complaintStatusHistory).values({
        complaintId: id,
        fromStatus: existing.status,
        toStatus: "escalated",
        actorType: "officer",
        actorId: request.officerSession!.sub,
        note: body.note ?? "Manually escalated",
      });
      await db.insert(auditEvents).values({
        actorKind: "officer",
        actorId: request.officerSession!.sub,
        action: "complaint.escalated",
        entityType: "complaint",
        entityId: id,
        metadata: { referenceNumber: existing.referenceNumber, note: body.note },
      });

      // Notify all political secretaries.
      const secretaries = await db
        .select({ id: officers.id })
        .from(officers)
        .where(and(eq(officers.role, "political_secretary"), eq(officers.isActive, true)));
      for (const secretary of secretaries) {
        await recordNotification(db, {
          complaintId: id,
          recipientType: "political_secretary",
          recipientId: secretary.id,
          templateKey: "complaint.escalated",
          payload: {
            referenceNumber: existing.referenceNumber,
            title: existing.title,
            byOfficer: request.officerSession!.sub,
          },
        });
      }

      if (updated) {
        notifyCitizenOfComplaintUpdate({
          complaintId: id,
          telegramUserId: existing.telegramUserId,
          referenceNumber: existing.referenceNumber,
          title: existing.title,
          status: updated.status,
          note: body.note,
          templateKey: "complaint.escalated",
          headline: "⚠️ <b>Aduan Dinaikkan Tahap</b>",
        });
      }

      return { complaint: updated };
    },
  );
}

async function recordNotification(
  db: ReturnType<typeof getDb>,
  entry: {
    complaintId: string;
    recipientType: string;
    recipientId: string;
    templateKey: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(notifications).values({
    complaintId: entry.complaintId,
    channel: "in_app",
    recipientType: entry.recipientType,
    recipientId: entry.recipientId,
    templateKey: entry.templateKey,
    payload: entry.payload,
    status: "pending",
  });
}

async function ensureCitizen(db: ReturnType<typeof getDb>, telegramUserId: string): Promise<string> {
  const [existing] = await db
    .select({ id: citizens.id })
    .from(citizens)
    .where(sql`${citizens.createdBy} = ${`tg:${telegramUserId}`}`)
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(citizens)
    .values({ createdBy: `tg:${telegramUserId}`, name: `Telegram ${telegramUserId}` })
    .returning({ id: citizens.id });
  if (!created) throw new Error("failed to create citizen");
  return created.id;
}
