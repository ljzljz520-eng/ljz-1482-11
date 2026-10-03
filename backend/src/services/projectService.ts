import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { logger } from "../config.js";
import { hashPayload, type ProjectPayload } from "../lib/canonical.js";
import type { CreateProjectInput } from "../lib/schemas.js";

export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

const CONTENT_LABELS: Record<string, string> = {
  short_video: "短视频",
  vlog: "Vlog 日志",
  documentary: "纪录短片",
  promo: "宣传片",
  tutorial: "教程视频"
};

const AUDIENCE_LABELS: Record<string, string> = {
  general: "大众受众",
  youth: "年轻群体",
  family: "亲子家庭",
  professional: "专业人士",
  tourist: "到访游客"
};

const RATIO_LABELS: Record<string, string> = {
  "16:9": "横屏 16:9",
  "9:16": "竖屏 9:16",
  "1:1": "方形 1:1",
  "4:5": "竖版 4:5",
  "21:9": "宽银幕 21:9"
};

/** 依据表单内容生成确定性的冻结脚本（创建瞬间定格，之后不再变化） */
export function buildFrozenScript(input: {
  title: string;
  contentType: string;
  audience: string;
  durationSec: number;
  aspectRatio: string;
  brief?: string | null;
}): string {
  const minutes = Math.max(1, Math.round(input.durationSec / 60));
  return [
    `《${input.title}》分镜脚本（冻结版本）`,
    `类型：${CONTENT_LABELS[input.contentType] ?? input.contentType}｜目标受众：${
      AUDIENCE_LABELS[input.audience] ?? input.audience
    }｜画幅：${RATIO_LABELS[input.aspectRatio] ?? input.aspectRatio}｜时长：约 ${minutes} 分钟`,
    "",
    "【开场 0-15s】以主场景空镜建立基调，标题动效入场。",
    "【铺垫 15s-1/3】抛出受众关心的核心问题或场景冲突。",
    "【展开 中段】用 3 个关键镜头推进信息，参考素材仅作创作参照。",
    "【收束 末段】呼应开头，给出明确的行动号召。",
    input.brief ? `\n创作备注：${input.brief}` : ""
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function toSnapshot(input: CreateProjectInput, referenceUrls: string[], attachmentCount: number) {
  return {
    version: 1,
    title: input.title.trim(),
    contentType: input.contentType,
    audience: input.audience,
    durationSec: input.durationSec,
    aspectRatio: input.aspectRatio,
    brief: input.brief ?? "",
    script: buildFrozenScript(input),
    referenceUrls,
    attachmentCount,
    frozenAt: new Date().toISOString()
  };
}

export interface CreateResult {
  recovered: boolean;
  conflict: boolean;
  project?: Awaited<ReturnType<typeof loadProjectDetail>>;
  existingHash?: string;
  incomingHash?: string;
}

/**
 * 幂等项目创建：
 * - 身份：clientRequestId（客户端生成并持久化，跨标签页/离线重连保持一致）
 * - 幂等条件：同请求号 + 同 payloadHash -> 返回原项目（含“成功响应丢失”后的恢复）
 * - 冲突：同请求号 + 不同 payloadHash -> 409
 * - 创建动作整体处于一个可序列化事务中：权限校验 + 项目/链接/附件/任务初始化原子提交
 */
export async function createProject(userId: string, input: CreateProjectInput): Promise<CreateResult> {
  const payload: ProjectPayload = {
    title: input.title,
    contentType: input.contentType,
    audience: input.audience,
    durationSec: input.durationSec,
    aspectRatio: input.aspectRatio,
    brief: input.brief,
    references: input.references.map((r) => ({ url: r.url, label: r.label ?? null })),
    attachments: input.attachments.map((a) => ({ fileName: a.fileName, sizeBytes: a.sizeBytes }))
  };
  const payloadHash = hashPayload(payload);

  // 快速路径：请求号已存在 -> 复用或冲突
  const existing = await prisma.draftRequest.findUnique({
    where: { clientRequestId: input.clientRequestId },
    include: { project: true }
  });
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      logger.warn(
        { clientRequestId: input.clientRequestId, userId },
        "idempotency conflict: same request id with different payload"
      );
      return { recovered: false, conflict: true, existingHash: existing.payloadHash, incomingHash: payloadHash };
    }
    const project = await loadProjectDetail(existing.projectId);
    return { recovered: true, conflict: false, project };
  }

  // 暂存附件归属预校验
  const stagingIds = input.attachments.map((a) => a.stagingId).filter((v): v is string => Boolean(v));
  const stagingRows = stagingIds.length
    ? await prisma.stagingFile.findMany({ where: { id: { in: stagingIds } } })
    : [];
  const stagingMap = new Map(stagingRows.map((s) => [s.id, s]));
  for (const ref of input.attachments) {
    if (!ref.stagingId) continue;
    const row = stagingMap.get(ref.stagingId);
    if (!row || row.userId !== userId) {
      throw new ServiceError(400, "STAGING_NOT_FOUND", `附件 ${ref.fileName} 的暂存记录不存在或不属于当前用户`);
    }
  }

  try {
    const projectId = await prisma.$transaction(
      async (tx) => {
        // 事务内再次确认请求号未被并发事务占用（双标签页同时提交）
        const raced = await tx.draftRequest.findUnique({ where: { clientRequestId: input.clientRequestId } });
        if (raced) {
          if (raced.payloadHash !== payloadHash) {
            throw new ServiceError(409, "IDEMPOTENCY_CONFLICT", "请求号已用于不同的创作内容，请使用新请求号", {
              existingHash: raced.payloadHash,
              incomingHash: payloadHash
            });
          }
          return raced.projectId;
        }

        // 权限在创建事务内校验：授权被收回（revokedAt）时整个初始化回滚
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          throw new ServiceError(401, "UNAUTHENTICATED", "用户不存在");
        }
        const grant = await tx.permission.findFirst({
          where: { userId, scope: "project:create", revokedAt: null },
          orderBy: { createdAt: "desc" }
        });
        if (!grant) {
          throw new ServiceError(403, "PERMISSION_REVOKED", "创建权限在提交时已被收回，项目初始化已回滚，未产生任何草稿");
        }
        // 账号层面的停用同样视为授权失效（保留独立错误码便于审计）
        if (!user.canCreate) {
          throw new ServiceError(403, "PERMISSION_REVOKED", "创建权限已被管理员收回，项目初始化已回滚");
        }

        const referenceUrls = input.references.map((r) => r.url.trim());
        const created = await tx.project.create({
          data: {
            ownerId: userId,
            title: input.title.trim(),
            contentType: input.contentType,
            audience: input.audience,
            durationSec: input.durationSec,
            aspectRatio: input.aspectRatio,
            brief: input.brief ?? "",
            snapshot: toSnapshot(input, referenceUrls, input.attachments.length),
            references: {
              create: input.references.map((r) => ({
                url: r.url.trim(),
                label: r.label ?? null
              }))
            },
            attachments: {
              create: input.attachments.map((a) => {
                const staged = a.stagingId ? stagingMap.get(a.stagingId) : undefined;
                if (staged && staged.status === "uploaded" && staged.storageKey) {
                  return {
                    fileName: a.fileName,
                    mime: staged.mime,
                    sizeBytes: a.sizeBytes,
                    status: "uploaded",
                    progressPct: 100,
                    storageKey: staged.storageKey
                  };
                }
                if (staged && staged.status === "quota_exceeded") {
                  return {
                    fileName: a.fileName,
                    mime: staged.mime,
                    sizeBytes: a.sizeBytes,
                    status: "quota_exceeded",
                    progressPct: 0,
                    failureNote: "浏览器存储配额不足，文件未能暂存"
                  };
                }
                return {
                  fileName: a.fileName,
                  mime: staged?.mime ?? "application/octet-stream",
                  sizeBytes: a.sizeBytes,
                  status: "pending_local",
                  progressPct: 0,
                  failureNote: "附件仍在本机处理中，尚未上传"
                };
              })
            }
          },
          include: { references: true }
        });

        // 参考素材进入独立解析队列（与创建事务一起原子入队，提交后 worker 可见）
        if (created.references.length) {
          await tx.parseJob.createMany({
            data: created.references.map((ref) => ({
              referenceId: ref.id,
              projectId: created.id,
              status: "queued"
            }))
          });
        }

        // 权限与项目关联（留痕：本次创建使用了哪条授权）
        await tx.permission.update({ where: { id: grant.id }, data: { projectId: created.id } });

        await tx.draftRequest.create({
          data: {
            clientRequestId: input.clientRequestId,
            userId,
            payloadHash,
            projectId: created.id
          }
        });

        return created.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }
    );

    const project = await loadProjectDetail(projectId);
    return { recovered: false, conflict: false, project };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    // 唯一约束冲突 = 并发事务抢先提交同请求号 -> 走恢复/冲突判定
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.draftRequest.findUnique({ where: { clientRequestId: input.clientRequestId } });
      if (winner) {
        if (winner.payloadHash !== payloadHash) {
          return { recovered: false, conflict: true, existingHash: winner.payloadHash, incomingHash: payloadHash };
        }
        const project = await loadProjectDetail(winner.projectId);
        return { recovered: true, conflict: false, project };
      }
    }
    logger.error({ err: error }, "create project transaction failed");
    throw new ServiceError(500, "CREATE_FAILED", "项目初始化失败，请稍后重试");
  }
}

export async function loadProjectDetail(id: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id },
    include: {
      references: { orderBy: { addedAt: "asc" }, include: { jobs: { orderBy: { enqueuedAt: "desc" } } } },
      attachments: { orderBy: { createdAt: "asc" } },
      draftRequest: true,
      permissions: true
    }
  });
  return project;
}
