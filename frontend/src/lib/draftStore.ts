import type { WizardDraft, AttachmentDraft } from "@/types/studio";

/**
 * 本地先写（Local-first）草稿存储：
 * - 单一事实来源键 creative-wizard-draft.v1，内含稳定的 clientRequestId（草稿身份）
 * - 导航返回 / 刷新 / 浏览器崩溃后可恢复编辑
 * - “清除本机草稿”只删除 localStorage，绝不调用任何服务器删除接口
 * - 监听 storage 事件：多标签页打开同一草稿时保持同步并提示
 */
const STORAGE_KEY = "creative-wizard-draft.v1";
const MULTI_TAB_FLAG = "creative-wizard-open.v1";

export function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

export function createLocalId(): string {
  return "l-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function emptyDraft(): WizardDraft {
  return {
    draftVersion: 1,
    clientRequestId: createRequestId(),
    title: "",
    contentType: "short_video",
    audience: "youth",
    durationSec: 30,
    aspectRatio: "9:16",
    brief: "",
    references: [],
    attachments: [],
    updatedAt: new Date().toISOString()
  };
}

export function loadDraft(): WizardDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardDraft;
    if (parsed.draftVersion !== 1 || !parsed.clientRequestId) return null;
    // File 对象无法持久化：恢复后附件标记为待重新选择/离线保留
    parsed.attachments = (parsed.attachments ?? []).map((a: AttachmentDraft) => ({
      ...a,
      file: undefined,
      status: a.status === "uploaded" ? a.status : "pending_local",
      note: a.status === "uploaded" ? a.note : "页面重载后文件句柄已释放，需重新选择或保持本机记录"
    }));
    return parsed;
  } catch {
    return null;
  }
}

export function persistDraft(draft: WizardDraft): void {
  const toSave: WizardDraft = {
    ...draft,
    // File 对象不可结构化持久化
    attachments: draft.attachments.map((a) => ({ ...a, file: undefined })),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

/** 清除本机草稿：仅影响本机，不触碰服务器项目 */
export function clearLocalDraft(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** 内容修改后生成新身份（旧请求号已被别的内容占用时使用） */
export function rotateRequestId(draft: WizardDraft): WizardDraft {
  return { ...draft, clientRequestId: createRequestId(), committedProjectId: undefined };
}

/**
 * 多标签页协同：
 * - BroadcastChannel 宣告同一向导在多个标签页打开（主通道）
 * - 同一草稿身份（clientRequestId）在两个标签页编辑时给出醒目提示：
 *   最终是否产生重复项目，由服务端请求号幂等保证
 */
export interface TabPresence {
  cleanup: () => void;
  onPeer: (handler: (info: { requestId: string; sameDraft: boolean }) => void) => void;
  announce: (requestId: string) => void;
}

export function connectTabPresence(currentRequestId: () => string): TabPresence {
  const handlers = new Set<(info: { requestId: string; sameDraft: boolean }) => void>();
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel("creative-wizard-presence");
  } catch {
    channel = null;
  }

  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type: string; requestId?: string } | null;
    if (!data || !data.requestId) return;
    if ((data.type === "hello" || data.type === "peer") && data.requestId) {
      const peerId: string = data.requestId;
      const sameDraft = peerId === currentRequestId();
      handlers.forEach((fn) => fn({ requestId: peerId, sameDraft }));
      if (data.type === "hello") {
        channel?.postMessage({ type: "peer", requestId: currentRequestId() });
      }
    }
  };
  channel?.addEventListener("message", onMessage);

  const announce = (requestId: string) => channel?.postMessage({ type: "hello", requestId });
  const cleanup = () => {
    channel?.removeEventListener("message", onMessage);
    channel?.close();
    localStorage.removeItem(MULTI_TAB_FLAG);
  };

  setTimeout(() => announce(currentRequestId()), 150);
  return {
    cleanup,
    onPeer: (handler) => {
      handlers.add(handler);
    },
    announce
  };
}

export const draftStorageKey = STORAGE_KEY;
