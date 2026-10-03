import { Router } from "express";
import { z } from "zod";
import express from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { logger } from "../logger";

export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

const ALLOWED_MIME = /^(video|audio|image)\/[\w.+-]+$|^application\/pdf$/;

const registerSchema = z.object({
  draftId: z.string().regex(/^[0-9a-fA-F-]{32,40}$/, "draftId 不合法"),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().regex(ALLOWED_MIME, "仅支持视频/音频/图片/PDF 附件"),
  sizeBytes: z.number().int().min(1).max(config.maxUploadBytes)
});

// 第一步：登记附件元数据（状态 uploading），随后客户端再传字节。
// 这样项目创建事务能看到"仍在上传中"的附件并给出明确状态。
attachmentsRouter.post("/", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const attachment = await prisma.attachment.create({
      data: {
        ownerId: req.user!.id,
        draftId: input.draftId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        status: "uploading"
      }
    });
    res.status(201).json({ id: attachment.id, status: attachment.status });
  } catch (err) {
    next(err);
  }
});

// 第二步：上传字节内容
attachmentsRouter.put(
  "/:id/content",
  express.raw({ type: () => true, limit: config.maxUploadBytes }),
  async (req, res, next) => {
    try {
      const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
      if (!attachment) throw notFound("ATTACHMENT_NOT_FOUND", "附件不存在");
      if (attachment.ownerId !== req.user!.id) throw forbidden("ATTACHMENT_FORBIDDEN", "无权操作该附件");
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("EMPTY_CONTENT", "附件内容为空");
      if (body.length > config.maxUploadBytes) throw badRequest("TOO_LARGE", "附件超过大小限制");

      fs.mkdirSync(config.uploadDir, { recursive: true });
      const storagePath = path.join(config.uploadDir, attachment.id);
      fs.writeFileSync(storagePath, body);

      // 若草稿已转化为项目，上传完成时自动关联
      const project = await prisma.project.findUnique({ where: { draftId: attachment.draftId }, select: { id: true } });
      const updated = await prisma.attachment.update({
        where: { id: attachment.id },
        data: {
          status: "uploaded",
          sizeBytes: body.length,
          storagePath,
          error: null,
          ...(project ? { projectId: project.id } : {})
        }
      });
      res.json({ id: updated.id, status: updated.status, sizeBytes: updated.sizeBytes });
    } catch (err) {
      next(err);
    }
  }
);

attachmentsRouter.get("/:id", async (req, res, next) => {
  try {
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!attachment) throw notFound("ATTACHMENT_NOT_FOUND", "附件不存在");
    if (attachment.ownerId !== req.user!.id) throw forbidden("ATTACHMENT_FORBIDDEN", "无权查看该附件");
    const { storagePath: _omit, ...rest } = attachment;
    res.json({ attachment: rest });
  } catch (err) {
    next(err);
  }
});

attachmentsRouter.post("/:id/fail", async (req, res, next) => {
  try {
    const { error } = z.object({ error: z.string().max(500) }).parse(req.body);
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!attachment) throw notFound("ATTACHMENT_NOT_FOUND", "附件不存在");
    if (attachment.ownerId !== req.user!.id) throw forbidden("ATTACHMENT_FORBIDDEN", "无权操作该附件");
    const updated = await prisma.attachment.update({ where: { id: attachment.id }, data: { status: "failed", error } });
    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    next(err);
  }
});

attachmentsRouter.delete("/:id", async (req, res, next) => {
  try {
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!attachment) throw notFound("ATTACHMENT_NOT_FOUND", "附件不存在");
    if (attachment.ownerId !== req.user!.id) throw forbidden("ATTACHMENT_FORBIDDEN", "无权操作该附件");
    if (attachment.projectId) throw forbidden("ATTACHMENT_LOCKED", "附件已关联项目，不能删除");
    if (attachment.storagePath) {
      fs.promises.unlink(attachment.storagePath).catch((e) => logger.warn({ err: e }, "unlink failed"));
    }
    await prisma.attachment.delete({ where: { id: attachment.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
