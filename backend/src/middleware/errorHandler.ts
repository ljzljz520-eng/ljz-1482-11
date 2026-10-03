import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "../lib/errors";
import { logger } from "../logger";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "接口不存在" } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "请求参数不合法",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
      }
    });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "记录不存在" } });
    return;
  }
  logger.error({ err, method: req.method, url: req.originalUrl }, "unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "服务器内部错误，请稍后重试" } });
}
