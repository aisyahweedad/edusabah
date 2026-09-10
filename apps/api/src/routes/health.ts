import type { FastifyInstance } from "fastify";
import { getClient } from "@k-aecs/database";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    service: "k-aecs-api",
    time: new Date().toISOString(),
  }));

  app.get("/ready", async (_request, reply) => {
    try {
      await getClient().execute({ sql: "select 1", args: [] });
      return { status: "ready", db: "up" };
    } catch (error) {
      app.log.error({ err: error }, "readiness probe failed");
      return reply.code(503).send({ status: "not_ready", db: "down" });
    }
  });
}
