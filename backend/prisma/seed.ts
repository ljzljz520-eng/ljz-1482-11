import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../dist/lib/crypto.js";
import { buildFrozenScript } from "../dist/services/projectService.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("[seed] start");

  const adminHash = await hashPassword("123456");
  const creatorHash = await hashPassword("123456");
  const guestHash = await hashPassword("123456");

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", displayName: "平台管理员", passwordHash: adminHash, role: Role.admin, canCreate: true }
  });
  const creator = await prisma.user.upsert({
    where: { username: "creator" },
    update: {},
    create: { username: "creator", displayName: "演示创作者", passwordHash: creatorHash, role: Role.creator, canCreate: true }
  });
  await prisma.user.upsert({
    where: { username: "guest" },
    update: {},
    create: { username: "guest", displayName: "待授权访客", passwordHash: guestHash, role: Role.creator, canCreate: false }
  });

  for (const user of [admin, creator]) {
    const existing = await prisma.permission.findFirst({ where: { userId: user.id, scope: "project:create", revokedAt: null } });
    if (!existing) {
      await prisma.permission.create({ data: { userId: user.id, scope: "project:create", grantedBy: admin.id } });
    }
  }

  const existingProject = await prisma.project.findFirst({ where: { ownerId: creator.id } });
  if (!existingProject) {
    const input = {
      title: "云溪夜巡：湖畔光影 30 秒",
      contentType: "short_video",
      audience: "youth",
      durationSec: 60,
      aspectRatio: "9:16",
      brief: "面向周末夜游的年轻受众，突出水雾灯光与栈道氛围。"
    };
    const snapshot = {
      version: 1,
      ...input,
      script: buildFrozenScript(input),
      referenceUrls: [
        "https://upload.wikimedia.org/wikipedia/commons/demo-lake.jpg",
        "https://example.com/moodboard.png?sim=reachable",
        "https://broken.example.net/clip.mp4?sim=unreachable"
      ],
      attachmentCount: 2,
      frozenAt: new Date().toISOString()
    };
    const project = await prisma.project.create({
      data: {
        ownerId: creator.id,
        ...input,
        snapshot,
        references: {
          create: [
            {
              url: "https://upload.wikimedia.org/wikipedia/commons/demo-lake.jpg",
              label: "湖区空镜（待确认许可）",
              formatValid: true,
              reachability: "reachable",
              license: "unlicensed",
              status: "done"
            },
            {
              url: "https://example.com/moodboard.png?sim=reachable",
              label: "情绪板（可访问但未授权）",
              formatValid: true,
              reachability: "reachable",
              license: "unlicensed",
              status: "done"
            },
            {
              url: "https://broken.example.net/clip.mp4?sim=unreachable",
              label: "失效的剪辑参考",
              formatValid: true,
              reachability: "unreachable",
              license: "unknown",
              status: "done"
            },
            {
              url: "https://example.com/brand-palette?sim=reachable",
              label: "解析进行中：品牌色板",
              formatValid: true,
              reachability: "unknown",
              license: "unknown",
              status: "parsing"
            }
          ]
        },
        attachments: {
          create: [
            { fileName: "opening-bgm.mp3", mime: "audio/mpeg", sizeBytes: 4_820_000, status: "uploaded", progressPct: 100 },
            { fileName: "logo-draft.fig", mime: "application/figma", sizeBytes: 920_000, status: "uploading", progressPct: 64, failureNote: "附件仍在上传中" }
          ]
        }
      },
      include: { references: true }
    });
    const refs = project.references;
    await prisma.parseJob.createMany({
      data: [
        { referenceId: refs[0].id, projectId: project.id, status: "done", finishedAt: new Date() },
        { referenceId: refs[1].id, projectId: project.id, status: "done", finishedAt: new Date() },
        { referenceId: refs[2].id, projectId: project.id, status: "done", finishedAt: new Date(), lastError: "HTTP 502" },
        { referenceId: refs[3].id, projectId: project.id, status: "processing", claimedAt: new Date() }
      ]
    });
    await prisma.draftRequest.create({
      data: { clientRequestId: "seed-demo-request-0001", userId: creator.id, payloadHash: "seed".padEnd(64, "0"), projectId: project.id }
    });
    const grant = await prisma.permission.findFirstOrThrow({ where: { userId: creator.id, scope: "project:create", revokedAt: null } });
    await prisma.permission.update({ where: { id: grant.id }, data: { projectId: project.id } });
    console.log("[seed] demo project created:", project.id);
  }

  console.log("[seed] done. accounts: admin/123456, creator/123456, guest/123456");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("[seed] failed", err);
    await prisma.$disconnect();
    process.exit(1);
  });
