import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";
import { requireAuth, requireAdmin } from "../middleware/auth";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// 权限授予/收回（验收演示：创建时权限被收回 → 服务端 403 PERMISSION_REVOKED）
adminRouter.post("/permissions", async (req, res, next) => {
  try {
    const { username, key, granted } = z
      .object({
        username: z.string().min(1),
        key: z.enum(["project:create"]),
        granted: z.boolean()
      })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) throw notFound("USER_NOT_FOUND", "用户不存在");
    const perm = await prisma.userPermission.upsert({
      where: { userId_key: { userId: user.id, key } },
      create: { userId: user.id, key, granted },
      update: { granted }
    });
    res.json({ permission: { username, key: perm.key, granted: perm.granted, updatedAt: perm.updatedAt } });
  } catch (err) {
    next(err);
  }
});
