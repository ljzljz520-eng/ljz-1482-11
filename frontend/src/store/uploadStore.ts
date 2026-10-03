import { create } from "zustand";
import { toast } from "react-hot-toast";
import { idb } from "@/utils/idb";
import { uuid } from "@/utils/ids";
import {
  registerAttachment,
  uploadAttachmentContent,
  markAttachmentFailed,
  deleteAttachment
} from "@/api/studio";
import { useWizardStore } from "./wizardStore";

/**
 * 附件上传管理器：模块级全局 store，路由切换后上传继续进行。
 * 文件先暂存 IndexedDB（刷新/离线可恢复），配额不足时降级为仅内存直传。
 */

export type UploadStatus = "queued" | "registering" | "uploading" | "uploaded" | "failed";

export interface UploadItem {
  localId: string;
  serverId?: string;
  draftId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: UploadStatus;
  progress: number;
  error?: string;
  persisted: boolean; // 是否已暂存 IndexedDB（刷新后可恢复）
}

interface UploadState {
  items: Record<string, UploadItem>;
  addFiles: (draftId: string, files: File[]) => Promise<void>;
  retry: (localId: string) => Promise<void>;
  remove: (localId: string) => Promise<void>;
  restoreForDraft: (draftId: string) => Promise<void>;
}

/** File 对象保存在模块级内存表中（IndexedDB 为持久化副本） */
const fileTable = new Map<string, File>();

async function processItem(localId: string) {
  const state = useUploadStore.getState();
  const item = state.items[localId];
  if (!item) return;
  const file = fileTable.get(localId);
  if (!file) {
    useUploadStore.setState((s) => ({
      items: { ...s.items, [localId]: { ...item, status: "failed", error: "本地文件句柄已丢失，请重新选择文件" } }
    }));
    return;
  }
  try {
    // 1. 登记元数据（服务端立刻可见"上传中"状态）
    let serverId = item.serverId;
    if (!serverId) {
      useUploadStore.setState((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: "registering" } } }));
      const reg = await registerAttachment({
        draftId: item.draftId,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes
      });
      serverId = reg.id;
      useUploadStore.setState((s) => ({
        items: { ...s.items, [localId]: { ...s.items[localId], serverId, status: "uploading" } }
      }));
      const rec = await idb.get(localId).catch(() => undefined);
      if (rec) await idb.put({ ...rec, serverId }).catch(() => undefined);
    } else {
      useUploadStore.setState((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: "uploading" } } }));
    }

    // 2. 上传字节
    await uploadAttachmentContent(serverId, file, (percent) => {
      useUploadStore.setState((s) => {
        const cur = s.items[localId];
        if (!cur) return s;
        return { items: { ...s.items, [localId]: { ...cur, progress: percent } } };
      });
    });

    useUploadStore.setState((s) => ({
      items: { ...s.items, [localId]: { ...s.items[localId], status: "uploaded", progress: 100, error: undefined } }
    }));
    await idb.remove(localId).catch(() => undefined);
    fileTable.delete(localId);
  } catch (err) {
    const message = err instanceof Error && err.message.includes("Network") ? "网络中断，等待重新上传" : "上传失败，请重试";
    useUploadStore.setState((s) => {
      const cur = s.items[localId];
      if (!cur) return s;
      return { items: { ...s.items, [localId]: { ...cur, status: "failed", error: message } } };
    });
    const sid = useUploadStore.getState().items[localId]?.serverId;
    if (sid) await markAttachmentFailed(sid, message);
  }
}

export const useUploadStore = create<UploadState>((set, get) => ({
  items: {},

  addFiles: async (draftId, files) => {
    for (const file of files) {
      const localId = uuid();
      fileTable.set(localId, file);
      const item: UploadItem = {
        localId,
        draftId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        status: "queued",
        progress: 0,
        persisted: false
      };
      set((s) => ({ items: { ...s.items, [localId]: item } }));

      // 尝试暂存 IndexedDB（配额不足 → 降级为仅内存，上传照常进行）
      try {
        await idb.put({
          localId,
          draftId,
          fileName: file.name,
          mimeType: item.mimeType,
          sizeBytes: file.size,
          blob: file
        });
        set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], persisted: true } } }));
      } catch {
        useWizardStore.setState({ quotaDegraded: true, localSync: "degraded" });
        toast.error("浏览器存储配额不足：附件未做本地暂存，正在直接上传，请勿刷新页面", { id: "idb-quota", duration: 6000 });
      }
      void processItem(localId);
    }
  },

  retry: async (localId) => {
    const item = get().items[localId];
    if (!item) return;
    if (!fileTable.has(localId)) {
      const rec = await idb.get(localId).catch(() => undefined);
      if (rec) fileTable.set(localId, new File([rec.blob], rec.fileName, { type: rec.mimeType }));
    }
    set((s) => ({ items: { ...s.items, [localId]: { ...s.items[localId], status: "queued", progress: 0, error: undefined } } }));
    void processItem(localId);
  },

  remove: async (localId) => {
    const item = get().items[localId];
    if (!item) return;
    if (item.serverId) await deleteAttachment(item.serverId).catch(() => undefined);
    await idb.remove(localId).catch(() => undefined);
    fileTable.delete(localId);
    set((s) => {
      const items = { ...s.items };
      delete items[localId];
      return { items };
    });
  },

  // 页面刷新后恢复：从 IndexedDB 找回未完成的附件并继续上传
  restoreForDraft: async (draftId) => {
    let records;
    try {
      records = await idb.listByDraft(draftId);
    } catch {
      return;
    }
    for (const rec of records) {
      if (get().items[rec.localId]) continue;
      fileTable.set(rec.localId, new File([rec.blob], rec.fileName, { type: rec.mimeType }));
      set((s) => ({
        items: {
          ...s.items,
          [rec.localId]: {
            localId: rec.localId,
            serverId: rec.serverId,
            draftId: rec.draftId,
            fileName: rec.fileName,
            mimeType: rec.mimeType,
            sizeBytes: rec.sizeBytes,
            status: "queued",
            progress: 0,
            persisted: true
          }
        }
      }));
      void processItem(rec.localId);
    }
  }
}));
