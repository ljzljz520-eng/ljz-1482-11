import fs from "fs";
import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./logger";

fs.mkdirSync(config.uploadDir, { recursive: true });

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "backend listening");
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
