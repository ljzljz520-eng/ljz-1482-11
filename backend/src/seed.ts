import fs from "fs";
import path from "path";
import { prisma } from "./lib/prisma";
import { hashPassword } from "./lib/crypto";
import { buildSnapshot } from "./services/snapshot";
import { config } from "./config";
import { logger } from "./logger";

/** 幂等种子脚本：容器启动时执行，可重复运行。 */
async function main() {
  logger.info("seeding database...");

  const users = [
    { username: "admin", displayName: "园区运营管理员", role: "admin", canCreate: true },
    { username: "creator", displayName: "内容创作者", role: "creator", canCreate: true },
    { username: "guest", displayName: "访客（已收回创建权限）", role: "creator", canCreate: false }
  ];

  const userIds: Record<string, string> = {};
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        passwordHash: hashPassword("123456")
      }
    });
    userIds[u.username] = user.id;
    await prisma.userPermission.upsert({
      where: { userId_key: { userId: user.id, key: "project:create" } },
      update: {},
      create: { userId: user.id, key: "project:create", granted: u.canCreate }
    });
  }

  // 演示项目：固定 draftId 保证幂等
  const demoDraftId = "00000000-0000-4000-8000-000000000001";
  const existing = await prisma.project.findUnique({ where: { draftId: demoDraftId } });
  if (!existing) {
    const snapshot = buildSnapshot({
      title: "云溪之夏 · 城市微度假宣传片",
      contentType: "promo",
      audience: "family",
      durationSec: 60,
      aspectRatio: "16:9",
      brief: "突出湖面晨雾、林间栈道与亲子露营区，传递“半小时逃离城市”的核心卖点。"
    });
    await prisma.draft.create({
      data: {
        id: demoDraftId,
        ownerId: userIds.admin,
        payload: { basics: { title: snapshot.title } },
        payloadHash: "seed",
        status: "converted"
      }
    });
    const project = await prisma.project.create({
      data: {
        ownerId: userIds.admin,
        draftId: demoDraftId,
        title: snapshot.title,
        contentType: "promo",
        audience: "family",
        durationSec: 60,
        aspectRatio: "16:9",
        brief: snapshot.brief,
        snapshot: snapshot as object
      }
    });

    // 演示素材：覆盖三级校验的各种组合状态
    const materials = [
      {
        url: "https://creativecommons.org/licenses/by/4.0/",
        formatStatus: "valid",
        reachability: "reachable",
        licenseStatus: "confirmed",
        licenseEvidence: "链接本身为 CC 许可页：creativecommons.org/licenses/by/4.0",
        parseStatus: "parsed",
        parsedMeta: { probedAt: new Date().toISOString(), httpStatus: 200, title: "Creative Commons — Attribution 4.0 International", contentType: "text/html", note: "HTTP 可访问仅代表资源存在，不代表已获得使用许可" }
      },
      {
        url: "https://example.com/stock/lake-morning.mp4",
        formatStatus: "valid",
        reachability: "reachable",
        licenseStatus: "unverified",
        licenseEvidence: null,
        parseStatus: "parsed",
        parsedMeta: { probedAt: new Date().toISOString(), httpStatus: 200, contentType: "video/mp4", note: "HTTP 可访问仅代表资源存在，不代表已获得使用许可" }
      },
      {
        url: "https://invalid..example/%%bad",
        formatStatus: "invalid",
        reachability: "unknown",
        licenseStatus: "unverified",
        parseStatus: "failed",
        lastError: "格式校验失败：不是合法的 URL 格式"
      },
      {
        url: "https://offline-cdn.example.net/forest-ambience.wav",
        formatStatus: "valid",
        reachability: "unreachable",
        licenseStatus: "unverified",
        parseStatus: "parsed",
        lastError: "connect ETIMEDOUT",
        parsedMeta: { probedAt: new Date().toISOString(), httpStatus: null, note: "资源当前不可访问，许可状态仍需人工确认" }
      }
    ];
    for (const m of materials) {
      const material = await prisma.referenceMaterial.create({
        data: { projectId: project.id, userAttested: false, ...m }
      });
      await prisma.parseJob.create({
        data: { materialId: material.id, materialVersion: 1, status: m.parseStatus === "parsed" || m.parseStatus === "failed" ? "done" : "queued" }
      });
    }

    // 演示附件：一个已上传（真实文件），一个上传失败（明确状态）
    fs.mkdirSync(config.uploadDir, { recursive: true });
    const demoFileId = "00000000-0000-4000-8000-0000000000a1";
    const demoFilePath = path.join(config.uploadDir, demoFileId);
    fs.writeFileSync(demoFilePath, Buffer.from("Yunxi Park demo storyboard placeholder\n"));
    await prisma.attachment.create({
      data: {
        id: demoFileId,
        ownerId: userIds.admin,
        draftId: demoDraftId,
        projectId: project.id,
        fileName: "分镜脚本-云溪之夏.txt",
        mimeType: "text/plain",
        sizeBytes: fs.statSync(demoFilePath).size,
        status: "uploaded",
        storagePath: demoFilePath
      }
    });
    await prisma.attachment.create({
      data: {
        ownerId: userIds.admin,
        draftId: demoDraftId,
        projectId: project.id,
        fileName: "航拍素材-湖面晨雾.mp4",
        mimeType: "video/mp4",
        sizeBytes: 38_400_000,
        status: "failed",
        error: "网络中断，等待重新上传"
      }
    });
    logger.info({ projectId: project.id }, "demo project seeded");
  } else {
    logger.info("demo project already exists, skipping");
  }

  logger.info("seed complete");
}

main()
  .catch((err) => {
    logger.error({ err }, "seed failed");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
