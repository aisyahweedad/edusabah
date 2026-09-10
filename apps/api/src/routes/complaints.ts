import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "@k-aecs/database";
import {
  citizens,
  complaints,
  complaintNotes,
  complaintStatusHistory,
} from "@k-aecs/database/schema";
import {
  complaintCreateSchema,
  complaintQuerySchema,
  complaintReplySchema,
  complaintUpdateStatusSchema,
} from "@k-aecs/validation";
import { authorize, resolveSession } from "../lib/auth.js";
import { sendError } from "../lib/http.js";

function referenceNumber(year: number, seq: number): string {
  return `KPSTI-${year}-${String(seq).padStart(6, "0")}`;
}

async function nextReferenceNumber(db: ReturnType<typeof getDb>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `KPSTI-${year}-%`;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(complaints)
    .where(like(complaints.referenceNumber, prefix));
  return referenceNumber(year, (row?.count ?? 0) + 1);
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
      const { page, pageSize, status, category, q } = qp.data;
      const db = getDb();
      const conditions = [
        status ? eq(complaints.status, status) : undefined,
        category ? eq(complaints.category, category) : undefined,
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

    return reply.code(201).send({ complaint: created });
  });

  // Citizen self-service lookup by reference number. Ownership is enforced via
  // the x-telegram-user-id header, matching the complaint's owner — no officer
  // permission is required and no other complaint's data is returned.
  app.get("/complaints/by-ref/:reference", async (request) => {
    const reference = (request.params as { reference: string }).reference.trim().toUpperCase();
    const telegramUserId = (request.headers["x-telegram-user-id"] as string | undefined)?.trim();
    if (!telegramUserId) {
      return { error: "MISSING_OWNER", message: "x-telegram-user-id header is required" };
    }
    const db = getDb();
    const [complaint] = await db
      .select()
      .from(complaints)
      .where(eq(complaints.referenceNumber, reference))
      .limit(1);
    if (!complaint) return { error: "NOT_FOUND", message: "Complaint not found" };
    if (complaint.telegramUserId !== telegramUserId) {
      return { error: "NOT_YOURS", message: "This reference does not belong to you" };
    }
    const notes = await db
      .select({ id: complaintNotes.id, content: complaintNotes.content, createdAt: complaintNotes.createdAt })
      .from(complaintNotes)
      .where(and(eq(complaintNotes.complaintId, complaint.id), sql`${complaintNotes.isInternal} = false`))
      .orderBy(sql`${complaintNotes.createdAt} desc`)
      .limit(20);
    return { complaint, notes };
  });

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
        })
        .returning();
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
        });
      }

      return { complaint: updated };
    },
  );
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
