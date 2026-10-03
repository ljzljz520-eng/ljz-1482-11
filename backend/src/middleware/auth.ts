import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { verifyToken, TokenPayload } from "../lib/crypto";
import { config } from "../config";
import { unauthorized, forbidden } from "../lib/errors";

export interface AuthedUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
  permissions: Record<string, boolean>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
      tokenPayload?: TokenPayload;
    }
  }
}

/** Loads the user fresh from DB on every request so permission revocation
 *  takes effect immediately (acceptance: 创建时权限被收回). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw unauthorized();
    const payload = verifyToken(token, config.jwtSecret);
    if (!payload) throw unauthorized();
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { permissions: true }
    });
    if (!user) throw unauthorized();
    req.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      permissions: Object.fromEntries(user.permissions.map((p) => [p.key, p.granted]))
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== "admin") return next(forbidden("ADMIN_REQUIRED", "需要管理员权限"));
  next();
}
