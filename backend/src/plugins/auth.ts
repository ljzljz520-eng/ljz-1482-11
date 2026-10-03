import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { prisma } from "../db.js";
import { sendError } from "../lib/http.js";
import type { Role } from "@prisma/client";

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  canCreate: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export default fp(async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
      return sendError(reply, 401, "UNAUTHENTICATED", "请先登录");
    }
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true }
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      return sendError(reply, 401, "SESSION_EXPIRED", "登录已过期，请重新登录");
    }
    request.user = {
      id: session.user.id,
      username: session.user.username,
      role: session.user.role,
      canCreate: session.user.canCreate
    };
  });

  app.decorate("requireAdmin", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || request.user.role !== "admin") {
      return sendError(reply, 403, "FORBIDDEN", "仅管理员可执行该操作");
    }
  });
});
