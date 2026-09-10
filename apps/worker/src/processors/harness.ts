import { Queue } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@k-aecs/database";
import { citizens, conversations, messages } from "@k-aecs/database/schema";
import { runHarness, type HarnessActor } from "@k-aecs/harness";
import type { Role } from "@k-aecs/shared";
import { loadEnv } from "@k-aecs/config";
import { DELIVER_JOB, DELIVERY_QUEUE, HARNESS_JOB, makeConnection, type HarnessJobPayload } from "../queues.js";

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
    .where(eq(conversations.id, conversationId))
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

export function createHarnessProcessor() {
  const deliverQueue = new Queue(DELIVERY_QUEUE, { connection: makeConnection() });

  return async (job: { name: string; data: HarnessJobPayload; id?: string }) => {
    if (job.name !== HARNESS_JOB) throw new Error(`unexpected job ${job.name}`);
    const env = loadEnv();
    const payload = job.data;
    const db = getDb();

    let conversationId = payload.conversationId;
    try {
      if (payload.actor.actorKind === "citizen") {
        const citizenId = await ensureCitizen(db, payload.actor.actorId);
        conversationId = await ensureConversation(db, citizenId, payload.channelId ?? "telegram", payload.conversationId);
      }
      await db.insert(messages).values({
        conversationId,
        role: "user",
        content: payload.userMessage,
        intent: payload.intent,
      });
    } catch (error) {
      console.error("[worker] failed to persist user message", error);
    }

    const actor: HarnessActor = {
      actorKind: payload.actor.actorKind,
      actorId: payload.actor.actorId,
      role: payload.actor.role as Role | null,
      telegramUserId: payload.actor.telegramUserId,
    };

    const result = await runHarness({ ...payload, actor, conversationId, intent: payload.intent });

    try {
      await db.insert(messages).values({
        conversationId,
        role: "assistant",
        content: result.text || "",
        intent: payload.intent,
        citations: result.citations,
        toolCalls: result.toolCalls.map((t) => `${t.toolName}:${t.ok ? "ok" : "error"}`),
      });
    } catch (error) {
      console.error("[worker] failed to persist assistant message", error);
    }

    if (payload.deliver?.channel === "telegram" && env.TELEGRAM_BOT_TOKEN) {
      await deliverQueue.add(
        DELIVER_JOB,
        {
          chatId: payload.deliver.chatId,
          text:
            (result.text || "Tiada jawapan.") +
            (result.toolCalls.some((t) => t.ok)
              ? `\n\n_${result.toolCalls.filter((t) => t.ok).map((t) => `🔎 ${t.toolName}`).join(", ")}_`
              : ""),
          parseMode: "Markdown",
        },
        { removeOnComplete: 100, removeOnFail: 1000 },
      );
    }

    return { runId: result.runId, status: result.status };
  };
}
