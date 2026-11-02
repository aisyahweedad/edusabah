import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@k-aecs/database";
import { auditEvents, notifications } from "@k-aecs/database/schema";
import { paginationSchema } from "@k-aecs/validation";
import { authorize, resolveSession } from "../lib/auth.js";
import { sendError } from "../lib/http.js";

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", resolveSession);

  /** Audit trail viewer — system_admin only (least privilege). */
  app.get(
    "/audit",
    { preHandler: [authorize("audit:view")] },
    async (request, reply) => {
      const qp = paginationSchema.safeParse(request.query);
      if (!qp.success) return sendError(reply, qp.error);
      const { page, pageSize } = qp.data;
      const db = getDb();
      const filter = (request.query as { action?: string; entityType?: string });
      const conditions = [
        filter.action ? eq(auditEvents.action, filter.action) : undefined,
        filter.entityType ? eq(auditEvents.entityType, filter.entityType) : undefined,
      ].filter(Boolean);
      const where = conditions.length ? and(...(conditions as [never])) : undefined;

      const rows = await db
        .select()
        .from(auditEvents)
        .where(where)
        .orderBy(desc(auditEvents.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const totals = await db
        .select({ total: sql<number>`count(*)` })
        .from(auditEvents)
        .where(where);
      const total = totals[0]?.total ?? 0;

      return { events: rows, page, pageSize, total };
    },
  );
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", resolveSession);

  /** Inbox for the signed-in officer / political secretary. */
  app.get(
    "/notifications",
    { preHandler: [authorize("complaint:view")] },
    async (request, reply) => {
      const qp = paginationSchema.safeParse(request.query);
      if (!qp.success) return sendError(reply, qp.error);
      const { page, pageSize } = qp.data;
      const db = getDb();
      const recipientId = request.officerSession!.sub;

      const rows = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientId, recipientId),
            sql`${notifications.recipientType} in ('officer','political_secretary')`,
          ),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const unreadRows = await db
        .select({ unread: sql<number>`count(*) filter (where ${notifications.status} = 'pending')` })
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientId, recipientId),
            sql`${notifications.recipientType} in ('officer','political_secretary')`,
          ),
        );
      const unread = unreadRows[0]?.unread ?? 0;

      return { notifications: rows, unread };
    },
  );

  /** Mark one (or all) of the officer's notifications as read. */
  app.post(
    "/notifications/:id/read",
    { preHandler: [authorize("complaint:view")] },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const db = getDb();
      await db
        .update(notifications)
        .set({ status: "read", sentAt: new Date() })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.recipientId, request.officerSession!.sub),
          ),
        );
      return { ok: true };
    },
  );
}
