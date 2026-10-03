import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { sendError } from "../lib/http.js";
import { logger } from "../config.js";

/**
 * 运维/验收接口（仅 admin）：
 * - 收回/恢复创建权限（验收“创建时权限被收回”）
 * - 对参考链接授权（验收“请求成功 ≠ 已获授权”的独立许可状态）
 * - 强制链接可达性（无外网环境下验收解析三态）
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post("/admin/permissions/revoke", { preHandler: [app.authenticate, app.requireAdmin] }, async (request, reply) => {
    const body = (request.body ?? {}) as { username?: string };
    if (!body.username) return sendError(reply, 422, "VALIDATION_ERROR", "缺少 username");
    const user = await prisma.user.findUnique({ where: { username: body.username } });
    if (!user) return sendError(reply, 404, "NOT_FOUND", "用户不存在");
    await prisma.permission.updateMany({
      where: { userId: user.id, scope: "project:create", revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await prisma.user.update({ where: { id: user.id }, data: { canCreate: false } });
    logger.warn({ username: body.username }, "creation permission revoked by admin");
    return reply.send({ ok: true, username: body.username, state: "revoked" });
  });

  app.post("/admin/permissions/restore", { preHandler: [app.authenticate, app.requireAdmin] }, async (request, reply) => {
    const body = (request.body ?? {}) as { username?: string };
    if (!body.username) return sendError(reply, 422, "VALIDATION_ERROR", "缺少 username");
    const user = await prisma.user.findUnique({ where: { username: body.username } });
    if (!user) return sendError(reply, 404, "NOT_FOUND", "用户不存在");
    await prisma.permission.create({
      data: { userId: user.id, scope: "project:create", grantedBy: request.user!.id }
    });
    await prisma.user.update({ where: { id: user.id }, data: { canCreate: true } });
    return reply.send({ ok: true, username: body.username, state: "granted" });
  });

  const refAction = z.object({ reachability: z.enum(["reachable", "unreachable"]).optional(), license: z.enum(["licensed", "unlicensed", "unknown"]).optional() });

  app.post("/admin/references/:refId/decision", { preHandler: [app.authenticate, app.requireAdmin] }, async (request, reply) => {
    const { refId } = request.params as { refId: string };
    const parsed = refAction.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 422, "VALIDATION_ERROR", "决策参数不合法");
    const ref = await prisma.referenceLink.findUnique({ where: { id: refId } });
    if (!ref) return sendError(reply, 404, "NOT_FOUND", "参考链接不存在");
    const updated = await prisma.referenceLink.update({
      where: { id: refId },
      data: {
        reachability: parsed.data.reachability ?? ref.reachability,
        license: parsed.data.license ?? ref.license,
        formatValid: true,
        status: "done"
      }
    });
    await prisma.parseJob.updateMany({
      where: { referenceId: refId, status: { in: ["queued", "processing"] } },
      data: { status: "done", finishedAt: new Date() }
    });
    logger.info({ refId, ...parsed.data }, "admin reference decision recorded");
    return reply.send({ reference: updated });
  });

  app.get("/admin/users", { preHandler: [app.authenticate, app.requireAdmin] }, async (_request, reply) => {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, displayName: true, role: true, canCreate: true, permissions: true }
    });
    return reply.send({ users });
  });
}
