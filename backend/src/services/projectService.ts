import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { sha256Hex } from "../lib/crypto";
import { canonicalStringify } from "../lib/canonical";
import { conflict, forbidden } from "../lib/errors";
import { buildSnapshot } from "./snapshot";
import { checkUrlFormat } from "./linkCheck";

export interface CreateProjectInput {
  draftId: string;
  title: string;
  contentType: string;
  audience: string;
  durationSec: number;
  aspectRatio: string;
  brief: string;
  materials: { url: string; userAttested: boolean }[];
  attachmentIds: string[];
}

export interface CreateProjectResult {
  projectId: string;
  draftId: string;
  recovered: boolean; // true = 命中草稿去重，恢复原项目而非新建副本
  replayed: boolean; // true = 同一 Idempotency-Key 的重放
  createdAt: string;
}

const projectInclude = { materials: true, attachments: true } as const;

function toResult(project: { id: string; draftId: string; createdAt: Date }, recovered: boolean, replayed: boolean): CreateProjectResult {
  return {
    projectId: project.id,
    draftId: project.draftId,
    recovered,
    replayed,
    createdAt: project.createdAt.toISOString()
  };
}

/**
 * 幂等创建项目：
 *  - Idempotency-Key 相同 + 载荷相同 → 返回首个响应（成功响应丢失后的恢复路径）
 *  - Idempotency-Key 相同 + 载荷不同 → 409 IDEMPOTENCY_CONFLICT
 *  - Key 不同但 draftId 相同（多标签页/离线重连并发）→ 唯一约束兜底，恢复原项目
 *  草稿转化、权限校验、素材入队、附件关联、摘要冻结全部在一个事务内完成。
 */
export async function createProjectIdempotent(
  userId: string,
  idempotencyKey: string,
  input: CreateProjectInput
): Promise<CreateProjectResult> {
  const payloadHash = sha256Hex(canonicalStringify(input));

  // 快速路径：该请求号已处理过
  const existingKey = await prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
  if (existingKey) {
    if (existingKey.userId !== userId || existingKey.payloadHash !== payloadHash) {
      throw conflict(
        "IDEMPOTENCY_CONFLICT",
        "同一请求号携带了不同的创建内容，已拒绝。如需修改请使用新的请求号。",
        { requestId: idempotencyKey }
      );
    }
    const stored = existingKey.response as unknown as CreateProjectResult | null;
    if (stored) return { ...stored, replayed: true };
    // 响应尚未写入（极端崩溃窗口）→ 按 draftId 恢复
    const project = await prisma.project.findUnique({ where: { draftId: input.draftId } });
    if (project) return toResult(project, true, true);
  }

  // 权限校验（实时读取，创建瞬间被收回也会被拦截；403 不占用幂等键）
  const perm = await prisma.userPermission.findUnique({
    where: { userId_key: { userId, key: "project:create" } }
  });
  if (!perm?.granted) {
    throw forbidden("PERMISSION_REVOKED", "项目创建权限已被收回，请联系管理员恢复后再试");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // 草稿去重：同一草稿只能转化出一个项目
      let draft = await tx.draft.findUnique({ where: { id: input.draftId } });
      if (draft && draft.ownerId !== userId) {
        throw forbidden("DRAFT_FORBIDDEN", "无权操作该草稿");
      }
      if (draft?.status === "converted") {
        const project = await tx.project.findUnique({ where: { draftId: input.draftId }, include: projectInclude });
        if (project) {
          const result = toResult(project, true, false);
          await recordIdempotency(tx, idempotencyKey, userId, payloadHash, result);
          return result;
        }
      }

      // 先确保草稿行存在（Project.draftId 外键依赖 + draftId 唯一占用）
      if (!draft) {
        draft = await tx.draft.create({
          data: {
            id: input.draftId,
            ownerId: userId,
            payload: input as unknown as Prisma.InputJsonValue,
            payloadHash,
            status: "editing"
          }
        });
      }

      const snapshot = buildSnapshot(input);
      const project = await tx.project.create({
        data: {
          ownerId: userId,
          draftId: input.draftId,
          title: input.title,
          contentType: input.contentType,
          audience: input.audience,
          durationSec: input.durationSec,
          aspectRatio: input.aspectRatio,
          brief: input.brief,
          snapshot: snapshot as unknown as Prisma.InputJsonValue
        },
        include: projectInclude
      });

      // 参考素材：同步做第 1 级格式校验，合法链接进入独立解析队列
      for (const m of input.materials) {
        const format = checkUrlFormat(m.url);
        const material = await tx.referenceMaterial.create({
          data: {
            projectId: project.id,
            url: format.normalized ?? m.url.trim(),
            formatStatus: format.ok ? "valid" : "invalid",
            reachability: "unknown",
            licenseStatus: m.userAttested ? "confirmed" : "unverified",
            licenseEvidence: m.userAttested ? "用户在创建时声明已获授权" : null,
            userAttested: m.userAttested,
            parseStatus: format.ok ? "queued" : "failed",
            lastError: format.ok ? null : `格式校验失败：${format.reason}`
          }
        });
        if (format.ok) {
          await tx.parseJob.create({ data: { materialId: material.id, materialVersion: 1 } });
        }
      }

      // 附件关联：把草稿名下已登记附件（含仍在上传中的）挂到项目
      if (input.attachmentIds.length > 0) {
        await tx.attachment.updateMany({
          where: { id: { in: input.attachmentIds }, ownerId: userId, draftId: input.draftId },
          data: { projectId: project.id }
        });
      }

      // 草稿标记为已转化
      await tx.draft.update({ where: { id: draft.id }, data: { status: "converted" } });

      const result = toResult(project, false, false);
      await recordIdempotency(tx, idempotencyKey, userId, payloadHash, result);
      return result;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const meta = err.meta as { target?: string[] } | undefined;
      const target = (meta?.target ?? []).join(",");
      if (target.includes("key")) {
        // 并发兜底：同请求号竞态 → 读取已落库结果并复核载荷
        const rec = await prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
        if (rec) {
          if (rec.payloadHash !== payloadHash || rec.userId !== userId) {
            throw conflict("IDEMPOTENCY_CONFLICT", "同一请求号携带了不同的创建内容，已拒绝。", { requestId: idempotencyKey });
          }
          const stored = rec.response as unknown as CreateProjectResult | null;
          if (stored) return { ...stored, replayed: true };
        }
      } else {
        // 并发兜底：Draft.id / Project.draftId 唯一冲突 → 另一标签页/重连请求抢先完成
        const project = await prisma.project.findUnique({ where: { draftId: input.draftId } });
        if (project) {
          // 恢复前必须复核请求号：若该请求号已被不同载荷占用，仍判 409 冲突
          const rec = await prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
          if (rec && (rec.payloadHash !== payloadHash || rec.userId !== userId)) {
            throw conflict("IDEMPOTENCY_CONFLICT", "同一请求号携带了不同的创建内容，已拒绝。", { requestId: idempotencyKey });
          }
          const result = toResult(project, true, false);
          if (!rec) {
            await prisma.idempotencyKey
              .create({
                data: {
                  key: idempotencyKey,
                  userId,
                  endpoint: "POST /api/projects",
                  payloadHash,
                  response: result as unknown as Prisma.InputJsonValue,
                  projectId: project.id
                }
              })
              .catch(() => undefined);
          }
          return result;
        }
      }
    }
    throw err;
  }
}

async function recordIdempotency(
  tx: Prisma.TransactionClient,
  key: string,
  userId: string,
  payloadHash: string,
  result: CreateProjectResult
) {
  await tx.idempotencyKey.create({
    data: {
      key,
      userId,
      endpoint: "POST /api/projects",
      payloadHash,
      response: result as unknown as Prisma.InputJsonValue,
      projectId: result.projectId
    }
  });
}
