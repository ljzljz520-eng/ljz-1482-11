import { useEffect } from "react";
import { toast } from "react-hot-toast";
import axios from "axios";
import { upsertDraft, getDraft } from "@/api/studio";
import { useWizardStore, selectDraftPayload } from "@/store/wizardStore";
import { useAuthStore } from "@/store/authStore";

/**
 * 草稿云端同步（后台、不阻塞编辑）：
 *  - 编辑防抖 1.2s 后 PUT /drafts/:id（幂等 upsert，draftId 跨标签页唯一）
 *  - 409 版本冲突 → 拉取服务端版本合并（服务端为准，提示用户）
 *  - 网络失败 → 标记离线，online 事件后自动补同步
 */
export function useWizardSync() {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let syncing = false;
    let dirty = false;

    const doSync = async () => {
      if (syncing) {
        dirty = true;
        return;
      }
      syncing = true;
      const s = useWizardStore.getState();
      if (s.convertedProjectId) {
        syncing = false;
        return; // 已转化的草稿不再同步
      }
      useWizardStore.setState({ serverSync: "syncing" });
      try {
        const res = await upsertDraft(s.draftId, selectDraftPayload(s), s.serverVersion ?? undefined);
        useWizardStore.setState({ serverSync: "synced", serverVersion: res.version });
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 409) {
          const code = err.response.data?.error?.code;
          if (code === "DRAFT_VERSION_CONFLICT") {
            // 版本合并：以服务端为准恢复，避免覆盖其他标签页/设备的修改
            try {
              const server = await getDraft(s.draftId);
              const payload = server.payload ?? {};
              useWizardStore.getState().hydrate(
                {
                  basics: { ...useWizardStore.getState().basics, ...(payload.basics ?? {}) },
                  materials: (payload.materials ?? []).map((m) => ({
                    id: crypto.randomUUID(),
                    url: m.url,
                    userAttested: m.userAttested ?? false
                  })),
                  step: payload.step ?? 1
                },
                { silent: true }
              );
              useWizardStore.setState({ serverSync: "synced", serverVersion: server.version });
              toast("草稿已在其他标签页更新，已合并为最新版本", { icon: "🔀", id: "draft-merge" });
            } catch {
              useWizardStore.setState({ serverSync: "conflict" });
            }
          } else if (code === "DRAFT_CONVERTED") {
            useWizardStore.setState({ serverSync: "synced" });
          } else {
            useWizardStore.setState({ serverSync: "conflict" });
          }
        } else {
          useWizardStore.setState({ serverSync: "offline" });
        }
      } finally {
        syncing = false;
        if (dirty) {
          dirty = false;
          void doSync();
        }
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(doSync, 1200);
    };

    const unsub = useWizardStore.subscribe((state, prev) => {
      if (state.basics !== prev.basics || state.materials !== prev.materials || state.draftId !== prev.draftId) {
        schedule();
      }
    });
    const onOnline = () => void doSync();
    window.addEventListener("online", onOnline);
    schedule(); // 挂载即同步一次（离线重连恢复）
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      if (timer) clearTimeout(timer);
    };
  }, [token]);
}
