import process from "node:process";
import { Redis } from "ioredis";
import { loadEnv } from "@k-aecs/config";
import { makeWorker, DELIVERY_QUEUE, HARNESS_QUEUE } from "./queues.js";
import { createHarnessProcessor } from "./processors/harness.js";
import { createDeliveryProcessor } from "./processors/delivery.js";

async function main(): Promise<void> {
  const env = loadEnv();

  // Prove Redis is reachable before taking jobs; BullMQ would retry forever
  // in the background otherwise, hiding a misconfiguration.
  try {
    const probe = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: false });
    await probe.ping();
    probe.disconnect();
  } catch (error) {
    console.error(
      `[worker] cannot reach Redis at ${env.REDIS_URL}. Is docker-compose up?`,
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }

  const harnessWorker = makeWorker(HARNESS_QUEUE, createHarnessProcessor());
  const deliveryWorker = makeWorker(DELIVERY_QUEUE, createDeliveryProcessor());

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received — closing`);
    await Promise.allSettled([harnessWorker.close(), deliveryWorker.close()]);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  console.log("[worker] started");
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
