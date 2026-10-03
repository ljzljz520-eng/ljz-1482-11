import { useState } from "react";
import { toast } from "react-hot-toast";
import { useAuthStore } from "@/store/authStore";
import { useWizardStore } from "@/store/wizardStore";
import { useUploadStore } from "@/store/uploadStore";
import { setPermission, listDrafts, getDraft, ServerDraft } from "@/api/studio";
import { idb } from "@/utils/idb";
import { replayLastCreate, tamperLastCreate } from "./createFlow";

/** 验收演示工具：权限收回、清除本机草稿、服务器草稿恢复、幂等冲突演示 */
const DemoPanel = () => {
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [serverDrafts, setServerDrafts] = useState<ServerDraft[] | null>(null);
  const user = useAuthStore((s) => s.user);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const canCreate = user?.permissions?.["project:create"] !== false;
  const isAdmin = user?.role === "admin";
  const draftId = useWizardStore((s) => s.draftId);
  const convertedProjectId = useWizardStore((s) => s.convertedProjectId);
  const createAttempt = useWizardStore((s) => s.createAttempt);

  const togglePermission = async () => {
    if (!user) return;
    try {
      const next = !canCreate;
      await setPermission(user.username, "project:create", next);
      await refreshMe();
      toast.success(next ? "已恢复项目创建权限" : "已收回项目创建权限（再点创建将被服务端 403 拦截）");
    } catch {
      /* 拦截器已提示 */
    }
  };

  const clearLocal = async () => {
    await idb.clearDraft(draftId).catch(() => undefined);
    useWizardStore.getState().clearLocalOnly();
    setConfirmClear(false);
    toast.success("本机草稿已清除（服务器上的草稿与项目不受影响）");
  };

  const loadServerDrafts = async () => {
    try {
      setServerDrafts(await listDrafts());
    } catch {
      /* 拦截器已提示 */
    }
  };

  const restoreDraft = async (id: string) => {
    try {
      const d = await getDraft(id);
      if (d.status === "converted") {
        toast("该草稿已转化为项目，不可继续编辑", { icon: "ℹ️" });
        return;
      }
      const payload = d.payload ?? {};
      useWizardStore.getState().hydrate({
        draftId: d.id,
        step: payload.step ?? 1,
        basics: {
          title: payload.basics?.title ?? "",
          contentType: payload.basics?.contentType ?? "",
          audience: payload.basics?.audience ?? "",
          durationSec: payload.basics?.durationSec ?? 30,
          aspectRatio: payload.basics?.aspectRatio ?? "",
          brief: payload.basics?.brief ?? ""
        },
        materials: (payload.materials ?? []).map((m) => ({
          id: crypto.randomUUID(),
          url: m.url,
          userAttested: m.userAttested ?? false
        })),
        convertedProjectId: null,
        pendingCreate: null,
        createAttempt: null
      });
      useWizardStore.setState({ serverVersion: d.version, serverSync: "synced" });
      void useUploadStore.getState().restoreForDraft(d.id);
      setServerDrafts(null);
    } catch {
      /* 拦截器已提示 */
    }
  };

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-500 transition hover:text-slate-700"
      >
        <span>🧪 验收演示工具（权限收回 / 本机清除 / 草稿恢复 / 幂等冲突）</span>
        <span>{open ? "收起 ▲" : "展开 ▼"}</span>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-slate-200 p-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={togglePermission}
            disabled={!isAdmin}
            title={isAdmin ? "" : "仅 admin 账号可操作"}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-primary/50 disabled:opacity-50"
          >
            <span className="font-medium text-slate-700">{canCreate ? "收回创建权限" : "恢复创建权限"}</span>
            <span className="mt-0.5 block text-slate-400">当前：{canCreate ? "可创建" : "已收回"} · 创建时服务端实时校验</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-primary/50"
          >
            <span className="font-medium text-slate-700">清除本机草稿</span>
            <span className="mt-0.5 block text-slate-400">仅删除本机缓存，服务器草稿与项目保留</span>
          </button>
          <button
            type="button"
            onClick={loadServerDrafts}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-primary/50"
          >
            <span className="font-medium text-slate-700">从服务器恢复草稿</span>
            <span className="mt-0.5 block text-slate-400">本机清除后，可拉回云端草稿继续编辑</span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void replayLastCreate()}
              disabled={!createAttempt || !convertedProjectId}
              title={!convertedProjectId ? "先成功创建一次项目" : ""}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-primary/50 disabled:opacity-50"
            >
              <span className="font-medium text-slate-700">重放创建请求</span>
              <span className="mt-0.5 block text-slate-400">同请求号同内容 → 返回原项目</span>
            </button>
            <button
              type="button"
              onClick={() => void tamperLastCreate()}
              disabled={!createAttempt || !convertedProjectId}
              title={!convertedProjectId ? "先成功创建一次项目" : ""}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-primary/50 disabled:opacity-50"
            >
              <span className="font-medium text-rose-600">篡改请求内容</span>
              <span className="mt-0.5 block text-slate-400">同请求号不同内容 → 409</span>
            </button>
          </div>

          {confirmClear && (
            <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <p className="font-medium">确认清除本机草稿？</p>
              <p className="mt-1">将删除本机缓存的草稿内容与未上传附件；服务器上的草稿、已创建的项目不受影响。</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={clearLocal} className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white transition hover:bg-amber-700">
                  确认清除
                </button>
                <button type="button" onClick={() => setConfirmClear(false)} className="rounded-lg border border-amber-300 px-3 py-1.5 transition hover:bg-amber-100">
                  取消
                </button>
              </div>
            </div>
          )}

          {serverDrafts && (
            <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-medium text-slate-600 mb-2">服务器草稿（{serverDrafts.length}）</p>
              {serverDrafts.length === 0 && <p className="text-xs text-slate-400">服务器上暂无草稿</p>}
              <ul className="space-y-1.5">
                {serverDrafts.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-700">
                      {d.title} <span className="text-slate-400">· v{d.version} · {new Date(d.updatedAt).toLocaleString()}</span>
                    </span>
                    {d.status === "converted" ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-slate-400">已转化</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void restoreDraft(d.id)}
                        className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary transition hover:bg-primary/20"
                      >
                        恢复编辑
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DemoPanel;
