import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { config, logger } from "../config.js";
import { sendError } from "../lib/http.js";
import { buildStagingKey, streamUploadToDisk } from "../services/storageService.js";

const registerSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mime: z.string().max(120).default("application/octet-stream"),
  sizeBytes: z.number().int().min(0).max(100 * 1024 * 1024)
});

/**
 * 附件三阶段流程：
 * 1) POST /staging        —— 登记，拿到 stagingId（离线时前端只登记本地）
 * 2) PUT  /staging/:id    —— 二进制流式上传（带进度）
 * 3) POST /projects       —— 创建事务把暂存附件并入项目
 * 配额不足在客户端先被 navigator.storage.estimate() 拦截，也可主动上报状态
 */
export async function stagingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/staging", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 422, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "附件信息不合法");
    }
    const staging = await prisma.stagingFile.create({
      data: {
        userId: request.user!.id,
        fileName: parsed.data.fileName,
        mime: parsed.data.mime,
        sizeBytes: parsed.data.sizeBytes,
        status: "uploading"
      }
    });
    return reply.status(201).send({ staging });
  });

  app.put("/staging/:id/content", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const staging = await prisma.stagingFile.findUnique({ where: { id } });
    if (!staging || staging.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "暂存记录不存在");
    }
    const storageKey = buildStagingKey(request.user!.id, id, staging.fileName);
    try {
      const { bytes } = await streamUploadToDisk(request, storageKey, config.maxUploadBytes);
      if (bytes < 0) {
        await prisma.stagingFile.update({
          where: { id },
          data: { status: "failed", storageKey: null }
        });
        return sendError(reply, 413, "FILE_TOO_LARGE", `附件超过 ${Math.round(config.maxUploadBytes / 1024 / 1024)}MB 上限`);
      }
      const updated = await prisma.stagingFile.update({
        where: { id },
        data: { status: "uploaded", storageKey, sizeBytes: bytes || staging.sizeBytes }
      });
      logger.info({ stagingId: id, bytes }, "staging upload stored");
      return reply.send({ staging: updated });
    } catch (err) {
      logger.warn({ err, stagingId: id }, "staging upload failed");
      await prisma.stagingFile.update({ where: { id }, data: { status: "failed" } }).catch(() => undefined);
      return sendError(reply, 502, "UPLOAD_FAILED", "附件上传中断，请重试");
    }
  });

  // 客户端主动上报本机状态（浏览器配额不足 / 离线保留 pending_local）
  app.patch("/staging/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { status?: string };
    const allowed = ["quota_exceeded", "failed", "pending_local"];
    if (!body.status || !allowed.includes(body.status)) {
      return sendError(reply, 422, "VALIDATION_ERROR", "不支持的暂存状态");
    }
    const staging = await prisma.stagingFile.findUnique({ where: { id } });
    if (!staging || staging.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "暂存记录不存在");
    }
    const updated = await prisma.stagingFile.update({ where: { id }, data: { status: body.status } });
    return reply.send({ staging: updated });
  });
}
