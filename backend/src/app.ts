import express from "express";
import { logger } from "./logger";
import { authRouter } from "./routes/auth";
import { draftsRouter } from "./routes/drafts";
import { projectsRouter } from "./routes/projects";
import { materialsRouter } from "./routes/materials";
import { attachmentsRouter } from "./routes/attachments";
import { adminRouter } from "./routes/admin";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  // 结构化访问日志
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      logger.info(
        { method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - start },
        "http request"
      );
    });
    next();
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.use("/api/auth", authRouter);
  app.use("/api/drafts", draftsRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/materials", materialsRouter);
  app.use("/api/attachments", attachmentsRouter);
  app.use("/api/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
