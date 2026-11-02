import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "@k-aecs/config";
import { AuthError } from "@k-aecs/auth";
import { closeDb } from "@k-aecs/database";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { harnessRoutes } from "./routes/harness.js";
import { complaintRoutes } from "./routes/complaints.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { auditRoutes, notificationRoutes } from "./routes/audit.js";
import { telegramRoutes } from "./routes/telegram.js";

export async function buildApp(): Promise<FastifyInstance> {
  const env = loadEnv();
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  // Map AuthError (statusCode lives in .details) onto real HTTP status codes
  // so RBAC denials surface as 401/403 instead of a generic 500.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) {
      void reply.code(error.details.statusCode).send({
        error: error.details.code,
        message: error.details.message,
      });
      return;
    }
    const err = error as { statusCode?: unknown; code?: string };
    const statusCode = typeof err.statusCode === "number" ? err.statusCode : 500;
    void reply.code(statusCode).send({
      error: err.code ?? "INTERNAL_ERROR",
      message: String(error instanceof Error ? error.message : error),
    });
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
  await app.register(auditRoutes, { prefix: "/api/v1" });
  await app.register(notificationRoutes, { prefix: "/api/v1" });
  await app.register(telegramRoutes, { prefix: "/webhooks" });

  return app;
}
