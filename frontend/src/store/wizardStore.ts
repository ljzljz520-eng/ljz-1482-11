import { create } from "zustand";
import { toast } from "react-hot-toast";
import { safeStorage, onQuotaExceeded } from "@/utils/safeStorage";
import { uuid } from "@/utils/ids";
import type { CreateProjectPayload, DraftPayload } from "@/api/studio";

/**
 * 向导草稿状态 —— 本地先写（local-first 编辑缓冲）：
 *  - 每次修改立即写入 localStorage（跨标签页共享 draftId，天然同源同步）
 *  - 配额不足时降级为纯内存，并提示用户（验收场景：浏览器配额不足）
 *  - 云端同步为后台行为，失败不阻塞编辑（离线体验）
 */

export const DRAFT_STORAGE_KEY = "yunxi.wizard.draft.v1";

export interface Basics {
  title: string;
  contentType: string;
  audience: string;
  durationSec: number;
  aspectRatio: string;
  brief: string;
}

export interface MaterialItem {
  id: string;
  url: string;
  userAttested: boolean;
}

export interface CreateAttempt {
  requestId: string;
  payloadHash: string;
}

export interface PendingCreate {
  requestId: string;
  payload: CreateProjectPayload;
  queuedAt: number;
}

export type LocalSync = "saved" | "degraded";
export type ServerSync = "idle" | "syncing" | "synced" | "offline" | "conflict";

interface PersistedShape {
  draftId: string;
  step: number;
  basics: Basics;
  materials: MaterialItem[];
  createAttempt: CreateAttempt | null;
  pendingCreate: PendingCreate | null;
  convertedProjectId: string | null;
  updatedAt: number;
}

interface WizardState extends PersistedShape {
  localSync: LocalSync;
  serverSync: ServerSync;
  serverVersion: number | null;
  quotaDegraded: boolean;
  setStep: (step: number) => void;
  updateBasics: (patch: Partial<Basics>) => void;
  addMaterial: (url: string) => void;
  updateMaterial: (id: string, patch: Partial<MaterialItem>) => void;
  removeMaterial: (id: string) => void;
  setServerState: (patch: Partial<Pick<WizardState, "serverSync" | "serverVersion">>) => void;
  setCreateAttempt: (attempt: CreateAttempt | null) => void;
  setPendingCreate: (pending: PendingCreate | null) => void;
  markConverted: (projectId: string) => void;
  hydrate: (shape: Partial<PersistedShape>, opts?: { silent?: boolean }) => void;
  resetForNewDraft: () => void;
  clearLocalOnly: () => void;
}

const emptyBasics = (): Basics => ({
  title: "",
  contentType: "",
  audience: "",
  durationSec: 30,
  aspectRatio: "",
  brief: ""
});

const initialPersisted = (): PersistedShape => ({
  draftId: uuid(),
  step: 1,
  basics: emptyBasics(),
  materials: [],
  createAttempt: null,
  pendingCreate: null,
  convertedProjectId: null,
  updatedAt: Date.now()
});

function loadInitial(): PersistedShape {
  const stored = safeStorage.get<PersistedShape | null>(DRAFT_STORAGE_KEY, null);
  if (stored && typeof stored.draftId === "string") {
    return { ...initialPersisted(), ...stored };
  }
  return initialPersisted();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export const useWizardStore = create<WizardState>((set, get) => ({
  ...loadInitial(),
  localSync: "saved",
  serverSync: "idle",
  serverVersion: null,
  quotaDegraded: false,

  setStep: (step) => set({ step, updatedAt: Date.now() }),
  updateBasics: (patch) =>
    set((s) => ({ basics: { ...s.basics, ...patch }, createAttempt: invalidateIfContent(s, "basics"), updatedAt: Date.now() })),
  addMaterial: (url) =>
    set((s) => ({
      materials: [...s.materials, { id: uuid(), url, userAttested: false }],
      createAttempt: invalidateIfContent(s, "materials"),
      updatedAt: Date.now()
    })),
  updateMaterial: (id, patch) =>
    set((s) => ({
      materials: s.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      createAttempt: invalidateIfContent(s, "materials"),
      updatedAt: Date.now()
    })),
  removeMaterial: (id) =>
    set((s) => ({
      materials: s.materials.filter((m) => m.id !== id),
      createAttempt: invalidateIfContent(s, "materials"),
      updatedAt: Date.now()
    })),
  setServerState: (patch) => set(patch),
  setCreateAttempt: (attempt) => set({ createAttempt: attempt }),
  setPendingCreate: (pending) => set({ pendingCreate: pending }),
  markConverted: (projectId) =>
    set({ convertedProjectId: projectId, pendingCreate: null, updatedAt: Date.now() }),
  hydrate: (shape, opts) => {
    set((s) => ({ ...s, ...shape, updatedAt: shape.updatedAt ?? Date.now() }));
    if (!opts?.silent) toast.success("草稿已恢复");
  },
  resetForNewDraft: () => set({ ...initialPersisted(), serverVersion: null, serverSync: "idle" }),
  clearLocalOnly: () => {
    // 仅清除本机副本：服务器上的草稿与已创建项目不受影响
    safeStorage.remove(DRAFT_STORAGE_KEY);
    set({ ...initialPersisted(), serverVersion: null, serverSync: "idle" });
  }
}));

/** 内容变化后作废旧请求号：同请求号携带不同内容会被服务端判 409。 */
function invalidateIfContent(s: WizardState, _changed: "basics" | "materials"): CreateAttempt | null {
  return s.createAttempt ? null : s.createAttempt;
}

// ---- 本地持久化（防抖 + 配额降级） ----
function persistLocal() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const s = useWizardStore.getState();
    const shape: PersistedShape = {
      draftId: s.draftId,
      step: s.step,
      basics: s.basics,
      materials: s.materials,
      createAttempt: s.createAttempt,
      pendingCreate: s.pendingCreate,
      convertedProjectId: s.convertedProjectId,
      updatedAt: s.updatedAt
    };
    const ok = safeStorage.set(DRAFT_STORAGE_KEY, shape);
    useWizardStore.setState({ localSync: ok ? "saved" : "degraded", quotaDegraded: !ok });
  }, 300);
}

useWizardStore.subscribe((state, prev) => {
  if (
    state.basics !== prev.basics ||
    state.materials !== prev.materials ||
    state.step !== prev.step ||
    state.draftId !== prev.draftId ||
    state.createAttempt !== prev.createAttempt ||
    state.pendingCreate !== prev.pendingCreate ||
    state.convertedProjectId !== prev.convertedProjectId
  ) {
    persistLocal();
  }
});

onQuotaExceeded(() => {
  useWizardStore.setState({ localSync: "degraded", quotaDegraded: true });
  toast.error("浏览器存储配额不足：草稿仅保留在内存中，请勿关闭页面，系统将直接同步到服务器", {
    id: "quota-exceeded",
    duration: 6000
  });
});

// ---- 跨标签页同步：同一浏览器多个标签页共享同一草稿身份 ----
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== DRAFT_STORAGE_KEY || !e.newValue) return;
    try {
      const incoming = JSON.parse(e.newValue) as PersistedShape;
      const current = useWizardStore.getState();
      if (incoming.draftId === current.draftId && incoming.updatedAt > current.updatedAt) {
        useWizardStore.getState().hydrate(incoming, { silent: true });
        toast("已同步另一个标签页的修改", { icon: "🔄", id: "cross-tab-sync" });
      }
    } catch {
      /* 忽略损坏的存储内容 */
    }
  });
}

export const selectDraftPayload = (s: WizardState): DraftPayload => ({
  basics: {
    title: s.basics.title || undefined,
    contentType: s.basics.contentType || undefined,
    audience: s.basics.audience || undefined,
    durationSec: s.basics.durationSec,
    aspectRatio: s.basics.aspectRatio || undefined,
    brief: s.basics.brief || undefined
  },
  materials: s.materials.map((m) => ({ url: m.url, userAttested: m.userAttested })),
  step: s.step
});
