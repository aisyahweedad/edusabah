import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loadEnv } from "@k-aecs/config";
import { constantTimeEqual } from "@k-aecs/auth";

/**
 * Telegram lightweight webhook receiver. It only validates the secret and
 * acknowledges updates; the telegram-bot service owns the real intent routing
 * (consent, menu, complaint intake) and calls the harness via POST
 * /api/v1/harness/run. This endpoint exists so deployments that tunnel
 * Telegram straight to the API still get a safe 200.
 */
export async function telegramRoutes(app: FastifyInstance): Promise<void> {
  app.post("/telegram", async (request: FastifyRequest, reply: FastifyReply) => {
    const env = loadEnv();
    const secret = request.headers["x-telegram-bot-api-secret-token"];
    if (
      (env.TELEGRAM_WEBHOOK_SECRET &&
        (typeof secret !== "string" ||
          !constantTimeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET))) || 
      (!env.TELEGRAM_WEBHOOK_SECRET && typeof secret !== "string")
    ) {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "Missing webhook secret" });
    }
    return reply.code(200).send({ ok: true });
  });
}
