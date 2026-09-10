import { buildApp } from "./app.js";
import { loadEnv } from "@k-aecs/config";

const env = loadEnv();
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info(`received ${signal}, shutting down`);
  await app.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port, host });
  app.log.info(`k-aecs api listening on http://${host}:${port} (env=${env.NODE_ENV})`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
