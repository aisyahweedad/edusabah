import { loadEnv } from "@k-aecs/config";
import { DELIVER_JOB, type TelegramDeliveryPayload } from "../queues.js";

function botApiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

/**
 * Consume telegram.deliver jobs: send a text message directly through the
 * Telegram Bot API. No grammY process has to be alive for this — it is ideal
 * for push notifications (status updates, officer replies) produced by the
 * worker.
 */
export function createDeliveryProcessor() {
  return async (job: { name: string; data: TelegramDeliveryPayload; id?: string }) => {
    if (job.name !== DELIVER_JOB) throw new Error(`unexpected job ${job.name}`);
    const env = loadEnv();
    if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

    const res = await fetch(
      botApiUrl(env.TELEGRAM_BOT_TOKEN, "sendMessage"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: job.data.chatId,
          text: job.data.text,
          parse_mode: job.data.parseMode,
        }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !body.ok) {
      throw new Error(`Telegram sendMessage failed: ${body.description ?? res.status}`);
    }
    return { sent: true, chatId: job.data.chatId };
  };
}
