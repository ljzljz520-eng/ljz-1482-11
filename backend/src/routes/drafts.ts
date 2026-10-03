import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { sha256Hex } from "../lib/crypto";
import { canonicalStringify } from "../lib/canonical";
import { conflict, forbidden, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";

export const draftsRouter = Router();
draftsRouter.use(requireAuth);

const draftPayloadSchema = z.object({
  basics: z
    .object({
      title: z.string().max(120).optional(),
      contentType: z.string().max(32).optional(),
      audience: z.string().max(32).optional(),
      durationSec: z.number().int().min(5).max(3600).optional(),
      aspectRatio: z.string().max(16).optional(),
      brief: z.string().max(2000).optional()
    })
    .partial()
    .optional(),
  materials: z
    .array(z.object({ url: z.string().max(2048), userAttested: z.boolean().optional() }))
    .max(20)
    .optional(),
  step: z.number().int().min(1).max(3).optional()
});

const upsertSchema = z.object({
  payload: draftPayloadSchema,
  baseVersion: z.number().int().min(0).optional()
});

// 服务器草稿列表（本机草稿被清除后可从这里恢复）
draftsRouter.get("/", async (req, res, next) => {
  try {
    const drafts = await prisma.draft.findMany({
      where: { ownerId: req.user!.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { project: { select: { id: true } } }
    });
    res.json({
      drafts: drafts.map((d) => ({
        id: d.id,
        status: d.status,
        version: d.version,
        updatedAt: d.updatedAt,
        title: (d.payload as { basics?: { title?: string } })?.basics?.title || "未命名草稿",
        projectId: d.project?.id ?? null
      }))
    });
  } catch (err) {
    next(err);
  }
});

draftsRouter.get("/:id", async (req, res, next) => {
  try {
    const draft = await prisma.draft.findUnique({ where: { id: req.params.id }, include: { project: { select: { id: true } } } });
    if (!draft || draft.ownerId !== req.user!.id) throw notFound("DRAFT_NOT_FOUND", "草稿不存在");
    res.json({
      id: draft.id,
      status: draft.status,
      version: draft.version,
      payload: draft.payload,
      updatedAt: draft.updatedAt,
      projectId: draft.project?.id ?? null
    });
  } catch (err) {
    next(err);
  }
});

// 幂等 upsert：draftId 由客户端生成并跨标签页共享，天然去重。
// baseVersion 提供乐观并发控制：版本不符返回 409 + 服务端最新内容供合并。
draftsRouter.put("/:id", async (req, res, next) => {
  try {
    const { payload, baseVersion } = upsertSchema.parse(req.body);
    const draftId = req.params.id;
    if (!/^[0-9a-fA-F-]{32,40}$/.test(draftId)) {
      throw conflict("DRAFT_ID_INVALID", "草稿标识不合法");
    }
    const payloadHash = sha256Hex(canonicalStringify(payload));
    const existing = await prisma.draft.findUnique({ where: { id: draftId } });

    if (existing) {
      if (existing.ownerId !== req.user!.id) throw forbidden("DRAFT_FORBIDDEN", "无权操作该草稿");
      if (existing.status === "converted") {
        throw conflict("DRAFT_CONVERTED", "该草稿已转化为项目，不能再修改");
      }
      if (baseVersion !== undefined && baseVersion !== existing.version) {
        throw conflict("DRAFT_VERSION_CONFLICT", "草稿已在其他地方更新", {
          serverVersion: existing.version,
          serverPayload: existing.payload,
          serverUpdatedAt: existing.updatedAt
        });
      }
      const updated = await prisma.draft.update({
        where: { id: draftId },
        data: { payload, payloadHash, version: { increment: 1 } }
      });
      res.json({ id: updated.id, version: updated.version, updatedAt: updated.updatedAt });
      return;
    }

    const created = await prisma.draft.create({
      data: { id: draftId, ownerId: req.user!.id, payload, payloadHash }
    });
    res.status(201).json({ id: created.id, version: created.version, updatedAt: created.updatedAt });
  } catch (err) {
    next(err);
  }
});
