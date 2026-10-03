import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { prisma } from "../db.js";
import { logger } from "../config.js";
import { sendError } from "../lib/http.js";
import { addReferenceSchema, createProjectSchema } from "../lib/schemas.js";
import { createProject, loadProjectDetail, ServiceError } from "../services/projectService.js";

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // 我的项目列表
  app.get("/projects", { preHandler: app.authenticate }, async (request, reply) => {
    const projects = await prisma.project.findMany({
      where: { ownerId: request.user!.id },
      orderBy: { createdAt: "desc" },
      include: {
        references: true,
        attachments: true,
        _count: { select: { jobs: true } }
      }
    });
    const list = projects.map((p) => ({
      id: p.id,
      title: p.title,
      contentType: p.contentType,
      audience: p.audience,
      durationSec: p.durationSec,
      aspectRatio: p.aspectRatio,
      snapshot: p.snapshot,
      createdAt: p.createdAt,
      referenceCount: p.references.length,
      pendingReferences: p.references.filter((r) => r.status !== "done").length,
      unfinishedAttachments: p.attachments.filter((a) => a.status !== "uploaded").length
    }));
    return reply.send({ items: list });
  });

  // 幂等创建
  app.post("/projects", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return sendError(reply, 422, "VALIDATION_ERROR", issue ? `${issue.path.join(".")}: ${issue.message}` : "输入不合法");
    }
    try {
      const result = await createProject(request.user!.id, parsed.data);
      if (result.conflict) {
        return sendError(reply, 409, "IDEMPOTENCY_CONFLICT", "相同请求号携带了不同内容：为避免覆盖既有项目，请求被拒绝。如需提交新内容，请生成新的请求号。", {
          existingHash: result.existingHash,
          incomingHash: result.incomingHash
        });
      }
      return reply.status(result.recovered ? 200 : 201).send({
        recovered: result.recovered,
        project: result.project
      });
    } catch (error) {
      if (error instanceof ServiceError) {
        return sendError(reply, error.status, error.code, error.message, error.extra);
      }
      if (error instanceof ZodError) {
        return sendError(reply, 422, "VALIDATION_ERROR", error.issues[0]?.message ?? "输入不合法");
      }
      logger.error({ err: error }, "POST /api/projects failed");
      return sendError(reply, 500, "INTERNAL", "服务器内部错误");
    }
  });

  // 项目详情（仅所有者可见——脚本页据此冻结展示）
  app.get("/projects/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const project = await loadProjectDetail(id);
      if (project.ownerId !== request.user!.id && request.user!.role !== "admin") {
        return sendError(reply, 404, "NOT_FOUND", "项目不存在或无权查看");
      }
      const createGrant = project.permissions.find((p) => p.scope === "project:create");
      return reply.send({
        ...project,
        frozenScript: (project.snapshot as { script: string }).script,
        permissionState: createGrant
          ? { revoked: createGrant.revokedAt !== null, revokedAt: createGrant.revokedAt }
          : { revoked: true, revokedAt: null }
      });
    } catch {
      return sendError(reply, 404, "NOT_FOUND", "项目不存在");
    }
  });

  // 异步解析期间，所有者可以改链接：旧任务随旧链接级联取消，新链接重新入队
  app.post("/projects/:id/references", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = addReferenceSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 422, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "链接不合法");
    }
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.ownerId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "项目不存在或无权操作");
    }
    const ref = await prisma.referenceLink.create({
      data: { projectId: id, url: parsed.data.url.trim(), label: parsed.data.label ?? null }
    });
    await prisma.parseJob.create({
      data: { referenceId: ref.id, projectId: id, status: "queued" }
    });
    const detail = await loadProjectDetail(id);
    return reply.status(201).send({ project: detail });
  });

  app.delete("/projects/:id/references/:refId", { preHandler: app.authenticate }, async (request, reply) => {
    const { id, refId } = request.params as { id: string; refId: string };
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.ownerId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "项目不存在或无权操作");
    }
    // jobs 随 reference 级联删除，旧链接的解析自然停止
    await prisma.referenceLink.deleteMany({ where: { id: refId, projectId: id } });
    const detail = await loadProjectDetail(id);
    return reply.send({ project: detail });
  });

  // 创建后补报附件状态（离线恢复 / 配额不足）
  app.patch("/projects/:id/attachments/:attId", { preHandler: app.authenticate }, async (request, reply) => {
    const { id, attId } = request.params as { id: string; attId: string };
    const body = (request.body ?? {}) as { status?: string; failureNote?: string; progressPct?: number };
    const allowed = ["pending_local", "failed", "quota_exceeded", "uploading"];
    if (!body.status || !allowed.includes(body.status)) {
      return sendError(reply, 422, "VALIDATION_ERROR", "不支持的附件状态");
    }
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.ownerId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "项目不存在或无权操作");
    }
    const att = await prisma.attachment.findFirst({ where: { id: attId, projectId: id } });
    if (!att) {
      return sendError(reply, 404, "NOT_FOUND", "附件不存在");
    }
    const updated = await prisma.attachment.update({
      where: { id: attId },
      data: {
        status: body.status,
        failureNote: body.failureNote ?? att.failureNote,
        progressPct: typeof body.progressPct === "number" ? Math.max(0, Math.min(100, body.progressPct)) : att.progressPct
      }
    });
    return reply.send({ attachment: updated });
  });
}
