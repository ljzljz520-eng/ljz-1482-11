import { toast } from "react-hot-toast";
import axios from "axios";
import { createProject, CreateProjectPayload } from "@/api/studio";
import { isNetworkError } from "@/api/client";
import { useWizardStore } from "@/store/wizardStore";
import { useUploadStore } from "@/store/uploadStore";
import { useAuthStore } from "@/store/authStore";
import { hashText } from "@/utils/crypto";
import { canonicalStringify, uuid } from "@/utils/ids";

/** 由当前向导状态组装创建载荷（提交与幂等演示共用同一构造函数） */
export function buildCreatePayload(dropPendingUploads: boolean): CreateProjectPayload | { error: string } {
  const s = useWizardStore.getState();
  const b = s.basics;
  if (!b.title.trim()) return { error: "请填写项目标题" };
  if (!b.contentType) return { error: "请选择内容类型" };
  if (!b.audience) return { error: "请选择目标受众" };
  if (!b.aspectRatio) return { error: "请选择画幅" };

  const uploads = Object.values(useUploadStore.getState().items).filter((i) => i.draftId === s.draftId);
  const attachmentIds = uploads
    .filter((u) => u.serverId && (dropPendingUploads ? true : u.status === "uploaded" || u.status === "uploading" || u.status === "registering"))
    .map((u) => u.serverId!);

  return {
    draftId: s.draftId,
    title: b.title.trim(),
    contentType: b.contentType,
    audience: b.audience,
    durationSec: b.durationSec,
    aspectRatio: b.aspectRatio,
    brief: b.brief.trim(),
    materials: s.materials.map((m) => ({ url: m.url.trim(), userAttested: m.userAttested })),
    attachmentIds
  };
}

/**
 * 提交创建（幂等）：
 *  - 请求号与载荷哈希绑定：内容变化 → 生成新请求号；重试/断网重放 → 复用原请求号
 *  - 成功响应丢失后重发 → 服务端返回原项目（recovered/replayed），不产生副本
 */
export async function submitCreate(dropPendingUploads: boolean): Promise<string | null> {
  const built = buildCreatePayload(dropPendingUploads);
  if ("error" in built) {
    toast.error(built.error);
    return null;
  }
  const payload = built;
  const store = useWizardStore.getState();
  const payloadHash = await hashText(canonicalStringify(payload));

  let requestId: string;
  if (!store.createAttempt || store.createAttempt.payloadHash !== payloadHash) {
    requestId = uuid();
    store.setCreateAttempt({ requestId, payloadHash });
  } else {
    requestId = store.createAttempt.requestId;
  }

  try {
    const result = await createProject(requestId, payload);
    useWizardStore.getState().markConverted(result.projectId);
    if (result.recovered || result.replayed) {
      toast.success("该草稿已存在项目，已为你恢复原项目（未创建副本）", { duration: 5000 });
    } else {
      toast.success("项目创建成功，脚本摘要已冻结");
    }
    return result.projectId;
  } catch (err) {
    if (isNetworkError(err)) {
      // 离线：同一请求号入队，联网后自动重放
      useWizardStore.getState().setPendingCreate({ requestId, payload, queuedAt: Date.now() });
      toast("当前离线：创建请求已加入队列，联网后自动提交", { icon: "📥", duration: 5000 });
      return null;
    }
    if (axios.isAxiosError(err) && err.response) {
      const code = err.response.data?.error?.code;
      const message = err.response.data?.error?.message;
      if (code === "PERMISSION_REVOKED") {
        toast.error(message ?? "创建权限已被收回");
        void useAuthStore.getState().refreshMe();
      } else if (code === "IDEMPOTENCY_CONFLICT") {
        toast.error(message ?? "同一请求号携带不同内容，已被服务端拒绝（409）", { duration: 6000 });
      } else {
        toast.error(message ?? "创建失败，请稍后重试");
      }
      return null;
    }
    toast.error("创建失败，请稍后重试");
    return null;
  }
}

/** 幂等演示 A：相同请求号 + 相同内容 → 应返回原项目（响应丢失恢复路径） */
export async function replayLastCreate(): Promise<void> {
  const s = useWizardStore.getState();
  if (!s.createAttempt) {
    toast.error("暂无已提交的创建请求可重放");
    return;
  }
  const built = buildCreatePayload(true);
  if ("error" in built) return;
  try {
    const result = await createProject(s.createAttempt.requestId, built);
    toast.success(
      result.replayed
        ? `重放成功：服务端命中幂等记录，返回原项目 ${result.projectId.slice(0, 8)}…`
        : result.recovered
          ? "服务端按草稿去重，恢复原项目（未创建副本）"
          : "服务端创建了新项目（注意：载荷与首次不一致时才会如此）",
      { duration: 6000 }
    );
  } catch (err) {
    if (axios.isAxiosError(err)) toast.error(err.response?.data?.error?.message ?? "重放失败");
  }
}

/** 幂等演示 B：相同请求号 + 不同内容 → 服务端必须返回 409 冲突 */
export async function tamperLastCreate(): Promise<void> {
  const s = useWizardStore.getState();
  if (!s.createAttempt) {
    toast.error("暂无已提交的创建请求可用于演示");
    return;
  }
  const built = buildCreatePayload(true);
  if ("error" in built) return;
  const tampered = { ...built, title: `${built.title}（篡改演示）` };
  try {
    await createProject(s.createAttempt.requestId, tampered);
    toast.error("异常：服务端未检测出内容篡改！");
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      toast.success(`符合预期：服务端返回 409 ${err.response.data?.error?.code ?? ""}，拒绝了同请求号的不同内容`, {
        duration: 6000
      });
    } else {
      toast.error("请求失败：" + (axios.isAxiosError(err) ? err.response?.data?.error?.message : "未知错误"));
    }
  }
}
