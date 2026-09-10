import { Worker, type ConnectionOptions } from "bullmq";
import { loadEnv } from "@k-aecs/config";

export const HARNESS_QUEUE = "k-aecs:harness";
export const DELIVERY_QUEUE = "k-aecs:delivery";

export const HARNESS_JOB = "harness.run";
export const DELIVER_JOB = "telegram.deliver";

/** Serializable payload for a harness.run job (mirrors HarnessRunInput). */
export interface HarnessJobPayload {
  requestId: string;
  userMessage: string;
  conversationId: string;
  channelId?: string;
  intent?: string;
  actor: {
    actorKind: "citizen" | "officer";
    actorId: string;
    role: string | null;
    telegramUserId?: string;
  };
  deliver?: { channel: "telegram"; chatId: string };
}

/** Serializable payload for a telegram.deliver job. */
export interface TelegramDeliveryPayload {
  chatId: string;
  text: string;
  parseMode?: "Markdown" | "HTML" | undefined;
}

/** BullMQ connection options shared by every queue/worker. */
export function makeConnection(): ConnectionOptions {
  const env = loadEnv();
  return {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  } as ConnectionOptions;
}

export function makeWorker<T extends object, R = void>(
  queueName: string,
  processor: (job: { name: string; data: T; id?: string }) => Promise<R>,
): Worker<T, R, string> {
  const worker = new Worker<T, R, string>(
    queueName,
    async (job) => processor(job),
    { connection: makeConnection(), concurrency: 4, maxStalledCount: 3 },
  );
  worker.on("failed", (job, err) =>
    console.error(`[worker] job failed (${queueName}/${job?.name})`, err),
  );
  worker.on("error", (err) => {
    console.error(`[worker] ${queueName} error:`, err.message);
  });
  worker.on("ready", () => console.log(`[worker] listening on queue "${queueName}"`));
  return worker;
}
