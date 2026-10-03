import { prisma } from "./lib/prisma";
import { claimJobs, processParseJob } from "./services/parser";
import { config } from "./config";
import { logger } from "./logger";

/**
 * 独立解析队列 Worker：与 API 进程分离部署（docker-compose 中独立服务）。
 * 轮询认领 queued 任务 → 三级校验（格式/可访问性/许可）→ 写回素材状态。
 */
let stopping = false;

async function tick() {
  const jobIds = await claimJobs(config.workerBatchSize);
  for (const id of jobIds) {
    if (stopping) break;
    await processParseJob(id).catch((err) => {
      logger.error({ err, jobId: id }, "processParseJob crashed");
    });
  }
  return jobIds.length;
}

async function main() {
  logger.info({ intervalMs: config.workerIntervalMs }, "parse worker started");
  // 等待数据库就绪（迁移由 backend 服务先行执行）
  for (;;) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      break;
    } catch (err) {
      logger.warn({ err }, "waiting for database...");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  while (!stopping) {
    try {
      const processed = await tick();
      if (processed === 0) await new Promise((r) => setTimeout(r, config.workerIntervalMs));
    } catch (err) {
      logger.error({ err }, "worker tick failed");
      await new Promise((r) => setTimeout(r, config.workerIntervalMs * 2));
    }
  }
  await prisma.$disconnect();
  logger.info("parse worker stopped");
}

process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

main().catch((err) => {
  logger.error({ err }, "worker fatal");
  process.exit(1);
});
