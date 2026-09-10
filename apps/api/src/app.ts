import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "@k-aecs/config";
import { closeDb } from "@k-aecs/database";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { harnessRoutes } from "./routes/harness.js";
import { complaintRoutes } from "./routes/complaints.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { telegramRoutes } from "./routes/telegram.js";

export async function buildApp(): Promise<FastifyInstance> {
  const env = loadEnv();
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  app.addHook("onClose", async () => {
    await closeDb();
  });

  await app.register(cors, { origin: true });

  app.get("/", async () => ({
    service: "k-aecs-api",
    version: "0.1.0",
    docs: "/health",
  }));

  await app.register(healthRoutes, { prefix: "/" });
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(harnessRoutes, { prefix: "/api/v1/harness" });
  await app.register(complaintRoutes, { prefix: "/api/v1" });
  await app.register(analyticsRoutes, { prefix: "/api/v1/analytics" });
  await app.register(telegramRoutes, { prefix: "/webhooks" });

  return app;
}
