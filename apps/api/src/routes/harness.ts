import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@k-aecs/database";
import {
  aiRuns,
  aiToolCalls,
  citizens,
  conversations,
  messages,
} from "@k-aecs/database/schema";
import { runHarness, type HarnessActor, type HarnessRunInput } from "@k-aecs/harness";
import type { Role } from "@k-aecs/shared";
import { harnessRunSchema, paginationSchema } from "@k-aecs/validation";
import { authorize, resolveSession } from "../lib/auth.js";
import { sendError } from "../lib/http.js";

function actorKind(actor: { kind: string }): "citizen" | "officer" {
  return actor.kind === "citizen" ? "citizen" : "officer";
}

function conversationIdFor(actor: { kind: string; telegramUserId?: string; officerId?: string }): string {
  if (actor.kind === "citizen" && actor.telegramUserId) return `tg:${actor.telegramUserId}`;
  return `off:${actor.officerId ?? "unknown"}`;
}

interface ParsedActor {
  actor: { kind: "citizen"; telegramUserId: string } | { kind: "officer"; role: string; officerId: string };
  channelId: string;
  message: string;
}

function parseBody(parsed: ParsedActor): { input: HarnessRunInput } {
  if (parsed.actor.kind === "citizen") {
    const actor: HarnessActor = {
      actorKind: "citizen",
      actorId: parsed.actor.telegramUserId,
      role: null,
      telegramUserId: parsed.actor.telegramUserId,
    };
    return {
      input: {
        userMessage: parsed.message,
        actor,
        conversationId: conversationIdFor(parsed.actor),
        channelId: parsed.channelId,
      },
    };
  }
  const role = parsed.actor.role as Role;
  const officerId = parsed.actor.officerId;
  const actor: HarnessActor = {
    actorKind: "officer",
    actorId: officerId,
    role,
  };
  return {
    input: {
      userMessage: parsed.message,
      actor,
      conversationId: conversationIdFor(parsed.actor),
      channelId: parsed.channelId,
    },
  };
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

async function ensureConversation(
  db: ReturnType<typeof getDb>,
  citizenId: string,
  channelId: string,
  conversationId: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(sql`${conversations.id} = ${conversationId}`)
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(conversations)
    .values({
      id: conversationId,
      citizenId,
      channel: "telegram",
      channelThreadId: channelId,
      title: `Telegram chat ${channelId}`,
    })
    .returning({ id: conversations.id });
  if (!created) throw new Error("failed to create conversation");
  return created.id;
}

export async function harnessRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", resolveSession);

  app.post("/run", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = harnessRunSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, parsed.error);
    const { input } = parseBody(parsed.data as unknown as ParsedActor);

    const db = getDb();
    let conversationId = input.conversationId;
    try {
      if (input.actor.actorKind === "citizen") {
        const citizenId = await ensureCitizen(db, input.actor.actorId);
        conversationId = await ensureConversation(
          db,
          citizenId,
          input.channelId ?? "telegram",
          input.conversationId,
        );
      }
      await db.insert(messages).values({
        conversationId,
        role: "user",
        content: input.userMessage,
      });
    } catch (error) {
      app.log.error({ err: error }, "failed to persist user message");
    }

    const result = await runHarness({ ...input, conversationId });

    try {
      await db.insert(messages).values({
        conversationId,
        role: "assistant",
        content: result.text || "",
        citations: result.citations,
        toolCalls: result.toolCalls.map((t) => `${t.toolName}:${t.ok ? "ok" : "error"}`),
      });
    } catch (error) {
      app.log.error({ err: error }, "failed to persist assistant message");
    }

    return reply.code(result.status === "ok" ? 200 : 500).send(result);
  });

  app.get(
    "/runs",
    { preHandler: [authorize("complaint:view")] },
    async (request, reply) => {
      const page = paginationSchema.safeParse(request.query);
      if (!page.success) return sendError(reply, page.error);
      const { pageSize } = page.data;
      const { conversationId, intent, status } = request.query as Record<string, string | undefined>;
      const db = getDb();
      const conditions = [
        conversationId ? eq(aiRuns.conversationId, conversationId) : undefined,
        intent ? eq(aiRuns.intent, intent) : undefined,
        status ? eq(aiRuns.status, status) : undefined,
      ].filter(Boolean);
      const where = conditions.length ? and(...(conditions as [any])) : undefined;
      const rows = await db
        .select()
        .from(aiRuns)
        .where(where)
        .orderBy(desc(aiRuns.createdAt))
        .limit(pageSize);
      return { runs: rows };
    },
  );

  app.get(
    "/runs/:id",
    { preHandler: [authorize("complaint:view")] },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const db = getDb();
      const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, id)).limit(1);
      if (!run) return { error: "NOT_FOUND", message: "Run not found" };
      const toolCalls = await db
        .select()
        .from(aiToolCalls)
        .where(eq(aiToolCalls.runId, run.id))
        .orderBy(aiToolCalls.createdAt);
      return { run, toolCalls };
    },
  );
}
