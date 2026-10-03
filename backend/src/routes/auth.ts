import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { sendError } from "../lib/http.js";
import { generateToken, verifyPassword } from "../lib/crypto.js";
import { loginSchema } from "../lib/schemas.js";
import { logger } from "../config.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 422, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "输入不合法");
    }
    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return sendError(reply, 401, "BAD_CREDENTIALS", "账号或密码错误");
    }
    const token = generateToken();
    await prisma.session.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS) }
    });
    logger.info({ userId: user.id, username }, "user logged in");
    return reply.send({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, canCreate: user.canCreate }
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (token) {
      await prisma.session.deleteMany({ where: { token } });
    }
    return reply.send({ ok: true });
  });

  app.get("/auth/me", { preHandler: app.authenticate }, async (request, reply) => {
    const grant = await prisma.permission.findFirst({
      where: { userId: request.user!.id, scope: "project:create", revokedAt: null }
    });
    return reply.send({
      user: request.user,
      permissions: { canCreateProject: Boolean(grant) && request.user!.canCreate, grantId: grant?.id ?? null }
    });
  });
}
