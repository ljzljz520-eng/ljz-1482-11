import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { checkUrlFormat } from "../services/linkCheck";

export const materialsRouter = Router();
materialsRouter.use(requireAuth);

async function loadOwnedMaterial(materialId: string, userId: string, role: string) {
  const material = await prisma.referenceMaterial.findUnique({
    where: { id: materialId },
    include: { project: { select: { ownerId: true } } }
  });
  if (!material) throw notFound("MATERIAL_NOT_FOUND", "素材不存在");
  if (material.project.ownerId !== userId && role !== "admin") {
    throw forbidden("MATERIAL_FORBIDDEN", "无权操作该素材");
  }
  return material;
}

// 异步解析期间修改链接：版本号 +1，旧解析任务结果自动作废，新链接重新入队
materialsRouter.patch("/:id", async (req, res, next) => {
  try {
    const { url } = z.object({ url: z.string().min(1, "请输入链接").max(2048) }).parse(req.body);
    const material = await loadOwnedMaterial(req.params.id, req.user!.id, req.user!.role);
    const format = checkUrlFormat(url);
    if (!format.ok) throw badRequest("URL_FORMAT_INVALID", `链接格式不合法：${format.reason}`);

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.referenceMaterial.update({
        where: { id: material.id },
        data: {
          url: format.normalized!,
          version: { increment: 1 },
          formatStatus: "valid",
          reachability: "unknown",
          licenseStatus: material.userAttested ? "confirmed" : "unverified",
          licenseEvidence: material.userAttested ? "用户在创建时声明已获授权" : null,
          parseStatus: "queued",
          parsedMeta: Prisma.JsonNull,
          lastError: null
        }
      });
      await tx.parseJob.create({ data: { materialId: material.id, materialVersion: next.version } });
      return next;
    });
    res.json({ material: updated });
  } catch (err) {
    next(err);
  }
});

// 使用许可声明：许可只能来自证据（用户声明 / 页面许可元数据），不能来自"请求成功"
materialsRouter.post("/:id/attest", async (req, res, next) => {
  try {
    const { attested } = z.object({ attested: z.boolean() }).parse(req.body);
    const material = await loadOwnedMaterial(req.params.id, req.user!.id, req.user!.role);
    const updated = await prisma.referenceMaterial.update({
      where: { id: material.id },
      data: attested
        ? { userAttested: true, licenseStatus: "confirmed", licenseEvidence: "用户在创建后声明已获授权" }
        : {
            userAttested: false,
            licenseStatus: material.licenseEvidence?.includes("CC 许可") ? "confirmed" : "unverified",
            licenseEvidence: material.licenseEvidence?.includes("CC 许可") ? material.licenseEvidence : null
          }
    });
    res.json({ material: updated });
  } catch (err) {
    next(err);
  }
});
