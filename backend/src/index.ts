import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { config, logger } from "./config.js";
import { ensureStorage } from "./services/storageService.js";
import registerAuth from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { parkRoutes } from "./routes/park.js";
import { projectRoutes } from "./routes/projects.js";
import { stagingRoutes } from "./routes/staging.js";
import { adminRoutes } from "./routes/admin.js";

async function bootstrap(): Promise<void> {
  await ensureStorage();

  const app = Fastify({
    logger: logger,
    bodyLimit: 12 * 1024 * 1024 // JSON 控制体上限；文件走 PUT 原始流，不受此限制
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(registerAuth);

  // 文件上传走 application/octet-stream：不做框架层 JSON 解析，
  // 路由内直接消费 request.raw 原始流（带大小上限）
  app.addContentTypeParser("application/octet-stream", (_request, _payload, done) => {
    done(null, undefined);
  });

  app.get("/health", async (_request, reply) => {
    return reply.send({ ok: true, role: "api", time: new Date().toISOString() });
  });

  const registerApi = async (api: FastifyInstance): Promise<void> => {
    await api.register(authRoutes);
    await api.register(parkRoutes);
    await api.register(projectRoutes);
    await api.register(stagingRoutes);
    await api.register(adminRoutes);
  };
  // 同时支持带 /api 前缀（nginx 保留前缀）与无前缀（vite/部分代理剥离前缀）
  await app.register(registerApi, { prefix: "/api" });
  await app.register(registerApi);

  app.setErrorHandler((error, request, reply) => {
    if (error.statusCode === 413) {
      return reply.status(413).send({ error: { code: "PAYLOAD_TOO_LARGE", message: "请求体过大" } });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send({ error: { code: "INTERNAL", message: "服务器开小差了" } });
  });

  await app.listen({ host: "0.0.0.0", port: config.port });
  logger.info(`api listening on :${config.port}`);
}

bootstrap().catch((err) => {
  logger.fatal({ err }, "api failed to start");
  process.exit(1);
});
