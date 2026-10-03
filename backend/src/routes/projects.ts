import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { createProjectIdempotent } from "../services/projectService";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const createSchema = z.object({
  draftId: z.string().regex(/^[0-9a-fA-F-]{32,40}$/, "draftId 不合法"),
  title: z.string().trim().min(1, "请填写项目标题").max(120),
  contentType: z.enum(["promo", "documentary", "short", "event"]),
  audience: z.enum(["family", "youth", "study", "business"]),
  durationSec: z.number().int().min(5).max(3600),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:5"]),
  brief: z.string().max(2000).default(""),
  materials: z
    .array(z.object({ url: z.string().min(1).max(2048), userAttested: z.boolean().default(false) }))
    .max(20)
    .default([]),
  attachmentIds: z.array(z.string().uuid()).max(20).default([])
});

projectsRouter.post("/", async (req, res, next) => {
  try {
    const idempotencyKey = req.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw badRequest("IDEMPOTENCY_KEY_REQUIRED", "缺少 Idempotency-Key 请求头（8-128 字符）");
    }
    const input = createSchema.parse(req.body);
    const result = await createProjectIdempotent(req.user!.id, idempotencyKey, input);
    res.status(result.recovered || result.replayed ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/", async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      where: { ownerId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { materials: true, attachments: true } } }
    });
    res.json({
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        contentType: p.contentType,
        durationSec: p.durationSec,
        aspectRatio: p.aspectRatio,
        createdAt: p.createdAt,
        materialCount: p._count.materials,
        attachmentCount: p._count.attachments
      }))
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/:id", async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { materials: { orderBy: { createdAt: "asc" } }, attachments: { orderBy: { createdAt: "asc" } } }
    });
    if (!project) throw notFound("PROJECT_NOT_FOUND", "项目不存在");
    if (project.ownerId !== req.user!.id && req.user!.role !== "admin") {
      throw forbidden("PROJECT_FORBIDDEN", "无权查看该项目");
    }
    res.json({ project });
  } catch (err) {
    next(err);
  }
});
