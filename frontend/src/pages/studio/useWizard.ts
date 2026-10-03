import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";
import type { AttachmentDraft, WizardDraft } from "@/types/studio";
import {
  clearLocalDraft,
  connectTabPresence,
  createLocalId,
  emptyDraft,
  loadDraft,
  persistDraft,
  rotateRequestId
} from "@/lib/draftStore";
import { studioApi } from "@/api/studio";
import { wizardFormSchema } from "@/lib/wizardSchema";

export type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "offline-queued" }
  | { kind: "recovered"; projectId: string }
  | { kind: "created"; projectId: string }
  | { kind: "conflict"; existingHash?: string; incomingHash?: string }
  | { kind: "forbidden"; code: string; message: string }
  | { kind: "error"; message: string };

/** 浏览器存储空间配额检查（附件落 IndexedBlob 前的预检） */
export async function estimateQuota(requiredBytes: number): Promise<{ ok: boolean; quotaMB: number; usageMB: number }> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { ok: true, quotaMB: -1, usageMB: -1 };
  }
  const est = await navigator.storage.estimate();
  const quota = est.quota ?? 0;
  const usage = est.usage ?? 0;
  return { ok: usage + requiredBytes <= quota, quotaMB: Math.round(quota / 1024 / 1024), usageMB: Math.round(usage / 1024 / 1024) };
}

function isOfflineError(err: unknown): boolean {
  const ax = err as AxiosError;
  return ax?.message === "Network Error" || ax?.code === "ERR_NETWORK" || !navigator.onLine;
}

export function useWizard() {
  const [draft, setDraft] = useState<WizardDraft>(() => loadDraft() ?? emptyDraft());
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const [multiTabPeer, setMultiTabPeer] = useState<{ sameDraft: boolean } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const saveTimer = useRef<number | null>(null);
  const presenceRef = useRef<ReturnType<typeof connectTabPresence> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // 自动保存（防抖）——本地先写
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      persistDraft(draft);
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [draft]);

  // 多标签页协同
  useEffect(() => {
    const presence = connectTabPresence(() => draftRef.current.clientRequestId);
    presenceRef.current = presence;
    presence.onPeer((info) => {
      setMultiTabPeer({ sameDraft: info.sameDraft });
      if (info.sameDraft) {
        toast("检测到同一草稿在另一个标签页打开：服务端请求号幂等将防止重复创建", { icon: "🗂️" });
      } else {
        toast("另一个标签页正在创建不同草稿", { icon: "🗂️" });
      }
    });
    return () => presence.cleanup();
  }, []);

  // 离线/上线
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const patch = useCallback((partial: Partial<WizardDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  }, []);

  const rotateId = useCallback(() => {
    setDraft((prev) => {
      const next = rotateRequestId(prev);
      persistDraft(next);
      return next;
    });
    toast.success("已生成新的请求号，本次将作为全新草稿提交");
  }, []);

  const resetDraft = useCallback(() => {
    const next = emptyDraft();
    setDraft(next);
    persistDraft(next);
    setSubmit({ kind: "idle" });
  }, []);

  /** “清除本机草稿”：只清本地，绝不删除服务器项目 */
  const forgetLocal = useCallback(() => {
    clearLocalDraft();
    const next = emptyDraft();
    setDraft(next);
    setSubmit({ kind: "idle" });
    toast.success("本机草稿已清除（服务器上的项目不受影响）");
  }, []);

  const validateForm = useCallback(() => {
    const result = wizardFormSchema.safeParse({
      title: draft.title,
      contentType: draft.contentType,
      audience: draft.audience,
      durationSec: draft.durationSec,
      aspectRatio: draft.aspectRatio,
      brief: draft.brief
    });
    return result;
  }, [draft]);

  /** 添加附件：先做浏览器配额预检，再决定直传或离线保留 */
  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      const localId = createLocalId();
      const base: AttachmentDraft = {
        localId,
        file,
        fileName: file.name,
        sizeBytes: file.size,
        mime: file.type || "application/octet-stream",
        status: "checking_quota",
        progressPct: 0
      };
      setDraft((prev) => ({ ...prev, attachments: [...prev.attachments, base] }));

      const quota = await estimateQuota(file.size);
      if (!quota.ok) {
        const failed: AttachmentDraft = {
          ...base,
          file: undefined,
          status: "quota_exceeded",
          note: `浏览器配额不足（已用 ${quota.usageMB}MB / 共 ${quota.quotaMB}MB），文件未能暂存`
        };
        setDraft((prev) => ({
          ...prev,
          attachments: prev.attachments.map((a) => (a.localId === localId ? failed : a))
        }));
        toast.error(`《${file.name}》因浏览器存储配额不足未能暂存`);
        continue;
      }

      if (!navigator.onLine) {
        const offline: AttachmentDraft = { ...base, status: "pending_local", offlineQueued: true, note: "当前离线，文件保留在本机，联网后补登" };
        setDraft((prev) => ({
          ...prev,
          attachments: prev.attachments.map((a) => (a.localId === localId ? offline : a))
        }));
        continue;
      }

      await uploadOne(base);
    }
  }, []);

  const uploadOne = useCallback(async (att: AttachmentDraft, explicitFile?: File) => {
    const file = explicitFile ?? att.file;
    if (!file) {
      setDraft((prev) => ({
        ...prev,
        attachments: prev.attachments.map((a) =>
          a.localId === att.localId ? { ...a, status: "pending_local", note: "缺少文件句柄，请重新选择" } : a
        )
      }));
      return;
    }
    try {
      setDraft((prev) => ({
        ...prev,
        attachments: prev.attachments.map((a) => (a.localId === att.localId ? { ...a, status: "uploading", progressPct: 2 } : a))
      }));
      const { data } = await studioApi.registerStaging(file.name, file.type || "application/octet-stream", file.size);
      const stagingId = data.staging.id;
      await studioApi.uploadStaging(stagingId, file, (pct) => {
        setDraft((prev) => ({
          ...prev,
          attachments: prev.attachments.map((a) => (a.localId === att.localId ? { ...a, progressPct: pct } : a))
        }));
      });
      setDraft((prev) => ({
        ...prev,
        attachments: prev.attachments.map((a) =>
          a.localId === att.localId ? { ...a, stagingId, status: "uploaded", progressPct: 100, note: undefined, offlineQueued: false } : a
        )
      }));
    } catch (err) {
      const offline = !navigator.onLine || isOfflineError(err);
      setDraft((prev) => ({
        ...prev,
        attachments: prev.attachments.map((a) =>
          a.localId === att.localId
            ? {
                ...a,
                status: offline ? "pending_local" : "failed",
                offlineQueued: offline,
                note: offline ? "网络中断：文件保留在本机草稿，联网后重试" : err instanceof Error ? err.message : "上传失败"
              }
            : a
        )
      }));
    }
  }, []);

  const retryAttachment = useCallback(
    (localId: string) => {
      const att = draftRef.current.attachments.find((a) => a.localId === localId);
      if (att?.file) void uploadOne(att);
      else toast("文件句柄已随页面刷新释放，请重新选择文件");
    },
    [uploadOne]
  );

  const removeAttachment = useCallback((localId: string) => {
    setDraft((prev) => ({ ...prev, attachments: prev.attachments.filter((a) => a.localId !== localId) }));
  }, []);

  /**
   * 提交创建（幂等）：
   * - 始终携带持久化的 clientRequestId；成功响应丢失/重复点击/离线重连都复用同一项目
   * - 同号异体 -> 409，不自动覆盖，交给用户决定是否换新请求号
   */
  const submitDraft = useCallback(async () => {
    const check = wizardFormSchema.safeParse({
      title: draftRef.current.title,
      contentType: draftRef.current.contentType,
      audience: draftRef.current.audience,
      durationSec: draftRef.current.durationSec,
      aspectRatio: draftRef.current.aspectRatio,
      brief: draftRef.current.brief
    });
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? "请检查创意设定");
      return;
    }
    setSubmit({ kind: "submitting" });
    try {
      const { data } = await studioApi.createProject(draftRef.current);
      const projectId = data.project.id;
      setDraft((prev) => {
        const next = { ...prev, committedProjectId: projectId };
        persistDraft(next);
        return next;
      });
      setSubmit({ kind: data.recovered ? "recovered" : "created", projectId });
      toast.success(data.recovered ? "已恢复到此前创建的项目（未生成副本）" : "项目创建成功，参考素材已进入解析队列");
    } catch (err) {
      const ax = err as AxiosError<{ error?: { code: string; message: string; existingHash?: string; incomingHash?: string } }>;
      const code = ax.response?.data?.error?.code;
      if (ax.response?.status === 409 || code === "IDEMPOTENCY_CONFLICT") {
        setSubmit({
          kind: "conflict",
          existingHash: ax.response?.data?.error?.existingHash,
          incomingHash: ax.response?.data?.error?.incomingHash
        });
        toast.error("冲突：同一请求号对应了不同内容，服务端拒绝覆盖");
      } else if (ax.response?.status === 403) {
        setSubmit({ kind: "forbidden", code: code ?? "FORBIDDEN", message: ax.response?.data?.error?.message ?? "没有创建权限" });
        toast.error("创建被拒绝：" + (ax.response?.data?.error?.message ?? "权限不足"));
      } else if (isOfflineError(err)) {
        setSubmit({ kind: "offline-queued" });
        toast("当前离线：草稿已在本机排队，恢复网络后自动重试同一请求号");
      } else {
        setSubmit({ kind: "error", message: ax.response?.data?.error?.message ?? "创建失败，请稍后重试" });
      }
    }
  }, []);

  // 离线恢复后自动重试一次（仍然是同一请求号 -> 恢复而非副本）
  useEffect(() => {
    if (online && submit.kind === "offline-queued") {
      const t = window.setTimeout(() => void submitDraft(), 800);
      return () => window.clearTimeout(t);
    }
  }, [online, submit.kind, submitDraft]);

  const canSubmit = useMemo(
    () => !draft.attachments.some((a) => a.status === "checking_quota" || a.status === "uploading"),
    [draft.attachments]
  );

  return {
    draft,
    patch,
    submit,
    setSubmit,
    online,
    multiTabPeer,
    canSubmit,
    addFiles,
    retryAttachment,
    removeAttachment,
    rotateId,
    resetDraft,
    forgetLocal,
    validateForm,
    submitDraft
  };
}
