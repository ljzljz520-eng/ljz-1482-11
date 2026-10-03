import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useWizardStore } from "@/store/wizardStore";
import { useUploadStore } from "@/store/uploadStore";
import { useAuthStore } from "@/store/authStore";
import { useWizardSync } from "@/hooks/useWizardSync";
import { submitCreate } from "./createFlow";
import StepBasics from "./StepBasics";
import StepMaterials from "./StepMaterials";
import StepConfirm from "./StepConfirm";
import DemoPanel from "./DemoPanel";
import { Pill } from "./components";

const STEPS = [
  { n: 1, label: "内容设置" },
  { n: 2, label: "参考素材" },
  { n: 3, label: "确认创建" }
];

const CreateWizard = () => {
  const navigate = useNavigate();
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const draftId = useWizardStore((s) => s.draftId);
  const localSync = useWizardStore((s) => s.localSync);
  const serverSync = useWizardStore((s) => s.serverSync);
  const convertedProjectId = useWizardStore((s) => s.convertedProjectId);
  const pendingCreate = useWizardStore((s) => s.pendingCreate);
  const resetForNewDraft = useWizardStore((s) => s.resetForNewDraft);
  const canCreate = useAuthStore((s) => s.user?.permissions?.["project:create"] !== false);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const restoreForDraft = useUploadStore((s) => s.restoreForDraft);

  const [creating, setCreating] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  // 草稿云端同步（防抖 + 冲突合并）
  useWizardSync();

  // 恢复未完成的附件上传（刷新/重开页面后）
  useEffect(() => {
    void restoreForDraft(draftId);
  }, [draftId, restoreForDraft]);

  // 权限状态：定时 + 聚焦刷新（创建时权限被收回的验收场景）
  useEffect(() => {
    void refreshMe();
    const timer = setInterval(() => void refreshMe(), 20000);
    const onFocus = () => void refreshMe();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshMe]);

  // 网络状态指示
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const onSubmit = async (dropPending: boolean) => {
    setCreating(true);
    try {
      const projectId = await submitCreate(dropPending);
      if (projectId) navigate(`/projects/${projectId}/script`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* 页头：标题 + 实时状态条 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">项目创建向导</h1>
          <p className="mt-1 text-sm text-slate-500">
            草稿自动保存到本机并同步云端，离开后可随时返回继续编辑
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {localSync === "saved" ? <Pill tone="ok">本地 · 已保存</Pill> : <Pill tone="warn">本地 · 配额不足已降级</Pill>}
          {serverSync === "synced" && <Pill tone="ok">云端 · 已同步</Pill>}
          {serverSync === "syncing" && <Pill tone="info">云端 · 同步中…</Pill>}
          {serverSync === "offline" && <Pill tone="warn">云端 · 离线待同步</Pill>}
          {serverSync === "conflict" && <Pill tone="bad">云端 · 版本冲突</Pill>}
          {serverSync === "idle" && <Pill tone="muted">云端 · 待同步</Pill>}
          {canCreate ? <Pill tone="ok">权限 · 可创建</Pill> : <Pill tone="bad">权限 · 已收回</Pill>}
          {online ? <Pill tone="ok">在线</Pill> : <Pill tone="warn">离线</Pill>}
        </div>
      </div>

      {/* 已转化提示 */}
      {convertedProjectId && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm text-emerald-800">✅ 该草稿已创建项目，本地副本已锁定。可查看项目，或开始一份新草稿。</p>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/projects/${convertedProjectId}/script`)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
            >
              查看项目脚本
            </button>
            <button
              onClick={resetForNewDraft}
              className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
            >
              开始新草稿
            </button>
          </div>
        </div>
      )}

      {/* 离线待提交提示 */}
      {pendingCreate && !convertedProjectId && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          📥 创建请求已加入离线队列（{new Date(pendingCreate.queuedAt).toLocaleTimeString()}），网络恢复后将自动提交，服务端幂等保证不会重复创建。
        </div>
      )}

      {/* 步骤条 */}
      <ol className="mt-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(s.n)}
              className={clsx(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition",
                step === s.n
                  ? "bg-primary text-white shadow-card"
                  : step > s.n
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
              )}
            >
              <span className={clsx("flex h-5 w-5 items-center justify-center rounded-full text-xs", step === s.n ? "bg-white/25" : "bg-white")}>
                {step > s.n ? "✓" : s.n}
              </span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
          </li>
        ))}
      </ol>

      {/* 步骤内容 */}
      <div className="mt-6 rounded-3xl border border-white bg-white/80 p-6 shadow-card backdrop-blur-sm md:p-8">
        {step === 1 && <StepBasics />}
        {step === 2 && <StepMaterials />}
        {step === 3 && <StepConfirm creating={creating} offline={!online} onSubmit={onSubmit} />}
      </div>

      {/* 底部导航 */}
      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="rounded-xl border border-slate-200 bg-white/80 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:border-primary/50 hover:text-primary disabled:opacity-40"
        >
          ← 上一步
        </button>
        <p className="hidden text-xs text-slate-400 md:block">草稿 ID：{draftId.slice(0, 8)}…（多标签页共享同一身份）</p>
        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep(Math.min(3, step + 1))}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-card transition hover:bg-primary/90 active:scale-[0.99]"
          >
            下一步 →
          </button>
        ) : (
          <span className="w-[88px]" />
        )}
      </div>

      <div className="mt-6">
        <DemoPanel />
      </div>
    </div>
  );
};

export default CreateWizard;
