/**
 * 极简 IndexedDB 封装：暂存待上传附件文件（File/Blob 无法放进 localStorage）。
 * 配额不足时 put 会抛错，由上层降级为"仅内存 + 直接上传"。
 */
const DB_NAME = "yunxi-studio";
const STORE = "attachmentBlobs";

export interface StoredBlob {
  localId: string;
  draftId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  serverId?: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "localId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 操作失败"));
    t.oncomplete = () => db.close();
    t.onerror = () => reject(t.error ?? new Error("IndexedDB 事务失败"));
  });
}

export const idb = {
  async put(record: StoredBlob): Promise<void> {
    await tx("readwrite", (s) => s.put(record));
  },
  async get(localId: string): Promise<StoredBlob | undefined> {
    return tx("readonly", (s) => s.get(localId));
  },
  async remove(localId: string): Promise<void> {
    await tx("readwrite", (s) => s.delete(localId));
  },
  async listByDraft(draftId: string): Promise<StoredBlob[]> {
    const all = await tx("readonly", (s) => s.getAll() as IDBRequest<StoredBlob[]>);
    return all.filter((r) => r.draftId === draftId);
  },
  async clearDraft(draftId: string): Promise<void> {
    const items = await idb.listByDraft(draftId);
    for (const item of items) await idb.remove(item.localId);
  }
};
