import path from "path";

export const config = {
  port: Number(process.env.PORT || 8000),
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret-change-me",
  tokenTtlSec: Number(process.env.TOKEN_TTL_SEC || 7 * 24 * 3600),
  uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024),
  fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS || 6000),
  workerIntervalMs: Number(process.env.WORKER_INTERVAL_MS || 2000),
  workerBatchSize: Number(process.env.WORKER_BATCH_SIZE || 4),
  workerMaxAttempts: Number(process.env.WORKER_MAX_ATTEMPTS || 3)
};
