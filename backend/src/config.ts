import pino from "pino";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://studio:studio@db:5432/studio",
  storageDir: process.env.STORAGE_DIR ?? "/data/uploads",
  maxUploadBytes: 100 * 1024 * 1024,
  workerPollMs: Number(process.env.WORKER_POLL_MS ?? 1500),
  workerJobDelayMs: Number(process.env.WORKER_JOB_DELAY_MS ?? 1200),
  isWorker: process.env.ROLE === "worker"
};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { role: process.env.ROLE ?? "api" },
  timestamp: pino.stdTimeFunctions.isoTime
});
