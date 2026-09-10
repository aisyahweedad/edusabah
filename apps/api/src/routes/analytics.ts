import type { FastifyInstance } from "fastify";
import { gte, sql } from "drizzle-orm";
import { getDb } from "@k-aecs/database";
import { aiRuns, complaints } from "@k-aecs/database/schema";
import { authorize, resolveSession } from "../lib/auth.js";

// SQLite stores timestamps as unix ms integers; group them per calendar day.
const day = (col: ReturnType<typeof sql>) =>
  sql<string>`strftime('%Y-%m-%d', ${col} / 1000, 'unixepoch')`;

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", resolveSession);

  app.get(
    "/dashboard",
    { preHandler: [authorize("analytics:view")] },
    async () => {
      const db = getDb();
      const daysAgo14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const [totals] = await db
        .select({
          total: sql<number>`count(*)`,
          open: sql<number>`count(*) filter (where ${complaints.status} not in ('closed','resolved','rejected'))`,
          resolved: sql<number>`count(*) filter (where ${complaints.status} in ('resolved','closed'))`,
        })
        .from(complaints);

      const byStatus = await db
        .select({ status: complaints.status, count: sql<number>`count(*)` })
        .from(complaints)
        .groupBy(complaints.status);

      const byCategory = await db
        .select({ category: complaints.category, count: sql<number>`count(*)` })
        .from(complaints)
        .groupBy(complaints.category);

      const byDay = await db
        .select({
          day: day(sql`${complaints.createdAt}`),
          count: sql<number>`count(*)`,
        })
        .from(complaints)
        .where(gte(complaints.createdAt, daysAgo14))
        .groupBy(day(sql`${complaints.createdAt}`))
        .orderBy(day(sql`${complaints.createdAt}`));

      const [aiTotals] = await db
        .select({
          runs: sql<number>`count(*)`,
          toolCalls: sql<number>`count(*)`,
          costUsdMicros: sql<number>`coalesce(sum(${aiRuns.costUsdMicros}),0)`,
        })
        .from(aiRuns);

      return {
        totals,
        byStatus,
        byCategory,
        byDay,
        ai: { runs: aiTotals?.runs ?? 0, costUsdMicros: aiTotals?.costUsdMicros ?? 0 },
      };
    },
  );

  app.get(
    "/ai-usage",
    { preHandler: [authorize("analytics:view")] },
    async () => {
      const db = getDb();
      const rows = await db
        .select({
          day: day(sql`${aiRuns.startedAt}`),
          runs: sql<number>`count(*)`,
          tokensInput: sql<number>`coalesce(sum(${aiRuns.tokensInput}),0)`,
          tokensOutput: sql<number>`coalesce(sum(${aiRuns.tokensOutput}),0)`,
          costUsdMicros: sql<number>`coalesce(sum(${aiRuns.costUsdMicros}),0)`,
        })
        .from(aiRuns)
        .where(gte(aiRuns.startedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
        .groupBy(day(sql`${aiRuns.startedAt}`))
        .orderBy(day(sql`${aiRuns.startedAt}`));
      return { rows };
    },
  );
}
