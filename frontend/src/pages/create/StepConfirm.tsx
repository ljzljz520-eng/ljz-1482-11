import { useMemo } from "react";
import { useWizardStore } from "@/store/wizardStore";
import { useUploadStore } from "@/store/uploadStore";
import { useAuthStore } from "@/store/authStore";
import { CONTENT_TYPES, AUDIENCES, ASPECTS, labelOf } from "./options";
import { Pill } from "./components";

interface Props {
  creating: boolean;
  offline: boolean;
  onSubmit: (dropPending: boolean) => void;
}

const StepConfirm = ({ creating, offline, onSubmit }: Props) => {
  const basics = useWizardStore((s) => s.basics);
  const materials = useWizardStore((s) => s.materials);
  const draftId = useWizardStore((s) => s.draftId);
  const uploadItems = useUploadStore((s) => s.items);
  const uploads = useMemo(() => Object.values(uploadItems).filter((i) => i.draftId === draftId), [uploadItems, draftId]);
  const canCreate = useAuthStore((s) => s.user?.permissions?.["project:create"] !== false);

  const pending = uploads.filter((u) => u.status !== "uploaded");
  const failedCount = uploads.filter((u) => u.status === "failed").length;
  const ready = basics.title.trim() && basics.contentType && basics.audience && basics.aspectRatio;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-5">
        <h4 className="text-sm font-semibold text-slate-800 mb-3">创建摘要</h4>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div><dt className="text-xs text-slate-400">项目标题</dt><dd className="font-medium text-slate-800 mt-0.5">{basics.title || "—"}</dd></div>
          <div><dt className="text-xs text-slate-400">内容类型</dt><dd className="font-medium text-slate-800 mt-0.5">{labelOf(CONTENT_TYPES, basics.contentType)}</dd></div>
          <div><dt className="text-xs text-slate-400">目标受众</dt><dd className="font-medium text-slate-800 mt-0.5">{labelOf(AUDIENCES, basics.audience)}</dd></div>
          <div><dt className="text-xs text-slate-400">时长</dt><dd className="font-medium text-slate-800 mt-0.5">{basics.durationSec} 秒</dd></div>
          <div><dt className="text-xs text-slate-400">画幅</dt><dd className="font-medium text-slate-800 mt-0.5">{labelOf(ASPECTS, basics.aspectRatio)}</dd></div>
          <div><dt className="text-xs text-slate-400">参考链接 / 附件</dt><dd className="font-medium text-slate-800 mt-0.5">{materials.length} 条 / {uploads.length} 个</dd></div>
        </dl>
        {basics.brief && (
          <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 leading-relaxed">{basics.brief}</div>
        )}
      </div>

      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">⚠️ {pending.length} 个附件尚未完成上传{failedCount > 0 ? `（${failedCount} 个失败）` : ""}</p>
          <p className="mt-1 text-xs leading-relaxed">
            你可以等待上传完成，或移除未完成附件。若选择「仍然创建」，未完成附件将以「上传中 / 失败」的明确状态关联到项目，
            后台继续上传完成后会自动更新状态。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSubmit(true)}
              disabled={creating || !canCreate || !ready}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
            >
              仍然创建（保留未完成附件状态）
            </button>
            <span className="self-center text-xs text-amber-700">或返回上一步等待 / 移除附件</span>
          </div>
        </div>
      )}

      {!canCreate && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          ⛔ 项目创建权限已被收回。你可以继续编辑草稿（已自动保存），恢复权限后再提交。
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 leading-relaxed">
        <p className="font-medium text-slate-600">提交保障</p>
        <p>· 重复点击、断网重连、多标签页同时提交 —— 服务端幂等机制保证只创建一个项目</p>
        <p>· 提交后脚本摘要立即冻结，参考链接进入独立解析队列</p>
        <p>· 当前网络状态：{offline ? <span className="text-amber-600 font-medium">离线（将加入提交队列）</span> : <span className="text-emerald-600 font-medium">在线</span>}</p>
      </div>

      <button
        type="button"
        onClick={() => onSubmit(false)}
        disabled={creating || !canCreate || !ready}
        className="w-full rounded-xl bg-gradient-to-r from-primary to-accent py-3 text-sm font-semibold text-white shadow-card transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {creating ? "正在创建…" : offline ? "离线中 · 加入提交队列" : !canCreate ? "权限已收回 · 无法创建" : "创建项目"}
      </button>
      {!ready && <p className="text-center text-xs text-slate-400">请先完成第 1 步：标题、内容类型、受众与画幅为必填项</p>}
    </div>
  );
};

export default StepConfirm;
