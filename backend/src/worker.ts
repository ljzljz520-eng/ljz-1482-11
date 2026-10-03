import { Prisma } from "@prisma/client";
import { config, logger } from "./config.js";
import { prisma } from "./db.js";
import { ensureStorage } from "./services/storageService.js";
import { checkLicense, checkReachable, checkUrlFormat } from "./services/referenceService.js";

/**
 * 独立解析队列 Worker：
 * - 队列载体为 PostgreSQL（ParseJob 表），无需额外 Redis
 * - 使用带 WHERE 条件的 UPDATE ... RETURNING 原子认领任务，
 *   多副本/多标签页触发的重复入队不会导致同一任务被两个 worker 同时处理
 */
async function claimNextJob(): Promise<{ id: string; referenceId: string } | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string; referenceId: string }>>(Prisma.sql`
    UPDATE "ParseJob"
    SET status = 'processing',
        "claimedAt" = NOW(),
        attempts = attempts + 1
    WHERE id = (
      SELECT j.id
      FROM "ParseJob" j
      WHERE j.status = 'queued'
      ORDER BY j."enqueuedAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "referenceId"
  `);
  return rows[0] ?? null;
}

async function processJob(jobId: string, referenceId: string): Promise<void> {
  const reference = await prisma.referenceLink.findUnique({ where: { id: referenceId } });
  if (!reference) {
    await prisma.parseJob.update({ where: { id: jobId }, data: { status: "failed", finishedAt: new Date(), lastError: "reference missing" } });
    return;
  }

  await prisma.referenceLink.update({ where: { id: referenceId }, data: { status: "parsing" } });

  // 第一层：格式
  const formatValid = checkUrlFormat(reference.url);
  if (!formatValid) {
    await prisma.referenceLink.update({
      where: { id: referenceId },
      data: { formatValid: false, reachability: "unreachable", license: "unknown", status: "done" }
    });
    await prisma.parseJob.update({
      where: { id: jobId },
      data: { status: "done", finishedAt: new Date(), lastError: "URL 格式不合法" }
    });
    logger.info({ referenceId, url: reference.url }, "reference rejected: bad format");
    return;
  }

  // 第二层：可访问
  const reach = await checkReachable(reference.url);

  // 人工/管理员可能已在此期间显式授权：不覆盖已有 licensed 决策
  const current = await prisma.referenceLink.findUniqueOrThrow({ where: { id: referenceId } });
  const preserveLicense = current.license === "licensed";

  // 第三层：许可（与可访问性严格分离）
  const licenseResult = preserveLicense
    ? { license: "licensed" as const, basis: "保留既有显式授权" }
    : await checkLicense(reference.url, reach.state);

  await prisma.referenceLink.update({
    where: { id: referenceId },
    data: {
      formatValid: true,
      reachability: reach.state,
      license: licenseResult.license,
      status: "done"
    }
  });
  await prisma.parseJob.update({
    where: { id: jobId },
    data: {
      status: "done",
      finishedAt: new Date(),
      lastError: reach.note ?? licenseResult.basis
    }
  });
  logger.info({ referenceId, reach: reach.state, license: licenseResult.license }, "reference parsed");
}

async function run(): Promise<void> {
  await ensureStorage();
  logger.info("reference parse worker started");
  while (true) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, config.workerPollMs));
        continue;
      }
      // 模拟异步解析耗时，便于观察“解析期间”的交互
      await new Promise((resolve) => setTimeout(resolve, config.workerJobDelayMs));
      try {
        await processJob(job.id, job.referenceId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        logger.error({ err, jobId: job.id }, "job processing failed");
        const fresh = await prisma.parseJob.findUnique({ where: { id: job.id } });
        if (fresh && fresh.attempts >= 5) {
          await prisma.parseJob
            .update({ where: { id: job.id }, data: { status: "failed", finishedAt: new Date(), lastError: `重试耗尽: ${message}` } })
            .catch(() => undefined);
        } else {
          await prisma.parseJob
            .update({ where: { id: job.id }, data: { status: "queued", claimedAt: null, lastError: message } })
            .catch(() => undefined);
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    } catch (err) {
      logger.error({ err }, "worker loop error");
      await new Promise((resolve) => setTimeout(resolve, config.workerPollMs * 2));
    }
  }
}

run().catch((err) => {
  logger.fatal({ err }, "worker crashed");
  process.exit(1);
});
