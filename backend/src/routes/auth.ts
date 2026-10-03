import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { verifyPassword, signToken } from "../lib/crypto";
import { config } from "../config";
import { unauthorized } from "../lib/errors";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名").max(64),
  password: z.string().min(1, "请输入密码").max(128)
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { username }, include: { permissions: true } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw unauthorized("用户名或密码不正确");
    }
    const token = signToken({ sub: user.id, username: user.username, role: user.role }, config.tokenTtlSec, config.jwtSecret);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        permissions: Object.fromEntries(user.permissions.map((p) => [p.key, p.granted]))
      }
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
