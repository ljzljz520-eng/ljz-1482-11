import { mkdir, rename, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join, resolve, normalize } from "node:path";
import type { FastifyRequest } from "fastify";
import { config, logger } from "../config.js";
import { randomUUID } from "node:crypto";

/** 防止路径穿越：存储键必须落在 storageDir 下 */
export function safeStoragePath(key: string): string {
  const base = resolve(config.storageDir);
  const target = resolve(join(base, key));
  if (!target.startsWith(base + "/") && target !== base) {
    throw new Error("invalid storage key");
  }
  return target;
}

export function buildStagingKey(userId: string, stagingId: string, fileName: string): string {
  const safeName = normalize(fileName).replace(/[/\\]/g, "_");
  return `staging/${userId}/${stagingId}-${safeName}`;
}

export function buildProjectKey(projectId: string, attachmentId: string, fileName: string): string {
  const safeName = normalize(fileName).replace(/[/\\]/g, "_");
  return `projects/${projectId}/${attachmentId}-${safeName}`;
}

export async function ensureStorage(): Promise<void> {
  await mkdir(join(config.storageDir, "staging"), { recursive: true });
  await mkdir(join(config.storageDir, "projects"), { recursive: true });
}

/**
 * 以原始流写入请求体，并在读取过程中强制大小上限。
 * 关键：超限后仍主动排空（resume）请求体，避免连接挂起，随后返回超限标记。
 */
export async function streamUploadToDisk(
  request: FastifyRequest,
  storageKey: string,
  maxBytes: number
): Promise<{ bytes: number }> {
  const target = safeStoragePath(storageKey);
  await mkdir(resolve(join(target, "..")), { recursive: true });

  return new Promise((resolve, reject) => {
    let bytes = 0;
    let exceeded = false;
    let settled = false;
    const writeStream = createWriteStream(target);

    const finish = (result: { bytes: number } | Error) => {
      if (settled) return;
      settled = true;
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    writeStream.on("error", (err) => {
      if (!exceeded) {
        logger.warn({ err, storageKey }, "upload write error");
        finish(err);
      }
    });
    writeStream.on("finish", () => {
      if (!exceeded) finish({ bytes });
    });

    request.raw.on("data", (chunk: Buffer) => {
      if (exceeded) return; // 排空期间只计数外丢弃
      bytes += chunk.length;
      if (bytes > maxBytes) {
        exceeded = true;
        request.raw.unpipe(writeStream);
        writeStream.destroy();
        rm(target, { force: true }).catch(() => undefined);
        return; // 后续数据由 flowing 模式自动排空
      }
      if (!writeStream.write(chunk)) {
        request.raw.pause();
        writeStream.once("drain", () => request.raw.resume());
      }
    });

    request.raw.on("end", () => {
      if (exceeded) {
        finish({ bytes: -1 });
      } else {
        writeStream.end();
      }
    });
    request.raw.on("error", (err) => {
      rm(target, { force: true }).catch(() => undefined);
      finish(err);
    });
  });
}

export async function moveStagingToProject(stagingKey: string, projectKey: string): Promise<void> {
  const from = safeStoragePath(stagingKey);
  const to = safeStoragePath(projectKey);
  await mkdir(resolve(join(to, "..")), { recursive: true });
  await rename(from, to);
}

export function newFileId(): string {
  return randomUUID();
}
