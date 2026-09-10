import { Bot } from "grammy";
import { loadEnv } from "@k-aecs/config";
import { registerBotHandlers } from "./bot.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runPolling(bot: Bot, info: { username?: string }): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      await bot.start({
        onStart: (startInfo) => console.log(`[telegram-bot] polling on @${startInfo.username ?? info.username}`),
      });
      return;
    } catch (error) {
      const err = error as { error_code?: number; description?: string };
      const isConflict =
        err && (err.error_code === 409 || /Conflict: terminated by other getUpdates request/.test(err.description ?? ""));
      if (!isConflict) throw error;
      attempt += 1;
      const delay = Math.min(30_000, 5_000 * attempt);
      console.warn(`[telegram-bot] getUpdates conflict (another instance is polling). retrying in ${delay / 1000}s…`);
      await sleep(delay);
    }
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.error("[telegram-bot] TELEGRAM_BOT_TOKEN is empty — set it in .env");
    process.exit(1);
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  bot.catch((err) => console.error("[telegram-bot] unhandled update error", err.error));

  registerBotHandlers(bot);

  if (env.TELEGRAM_WEBHOOK_SECRET && env.PUBLIC_API_URL) {
    // v1: Telegram is told to POST updates to the API's /webhooks/telegram,
    // which validates and acknowledges them. This process runs in polling mode
    // so a local tunnel is never required for development.
    console.warn(
      "[telegram-bot] TELEGRAM_WEBHOOK_SECRET is set — the API /webhooks/telegram receiver " +
        "acks updates, but intent routing still happens here via long polling.",
    );
  }

  await bot.init();
  console.log(`[telegram-bot] started as @${bot.botInfo.username}`);
  await runPolling(bot, { username: bot.botInfo.username });
}

main().catch((error) => {
  console.error("[telegram-bot] fatal", error);
  process.exit(1);
});
