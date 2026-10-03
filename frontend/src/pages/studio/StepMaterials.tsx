import { useState } from "react";
import toast from "react-hot-toast";
import type { AttachmentDraft, ReferenceDraft, WizardDraft } from "@/types/studio";
import { Badge, Button, Card, TextInput } from "@/components/studio/ui";
import { validateReferenceUrl } from "@/lib/wizardSchema";
import { createLocalId } from "@/lib/draftStore";
import { formatBytes } from "@/utils/format";

function formatStatus(status: AttachmentDraft["status"]) {
  switch (status) {
    case "selected":
      return { tone: "slate" as const, text: "待处理" };
    case "checking_quota":
      return { tone: "amber" as const, text: "配额检查中…" };
    case "quota_exceeded":
      return { tone: "rose" as const, text: "浏览器配额不足" };
    case "staging_registered":
      return { tone: "blue" as const, text: "已登记待上传" };
    case "uploading":
      return { tone: "blue" as const, text: "上传中" };
    case "uploaded":
      return { tone: "green" as const, text: "已上传" };
    case "failed":
      return { tone: "rose" as const, text: "上传失败" };
    case "pending_local":
      return { tone: "amber" as const, text: "本机保留（离线）" };
  }
}

export default function StepMaterials({
  draft,
  patch,
  onAddFiles,
  onRetryAttachment,
  onRemoveAttachment
}: {
  draft: WizardDraft;
  patch: (partial: Partial<WizardDraft>) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onRetryAttachment: (localId: string) => void;
  onRemoveAttachment: (localId: string) => void;
}) {
  const [urlInput, setUrlInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const addReference = () => {
    const url = urlInput.trim();
    if (!url) return;
    const error = validateReferenceUrl(url);
    if (error) {
      setUrlError(error);
      return;
    }
    const item: ReferenceDraft = { localId: createLocalId(), url, label: labelInput.trim() };
    patch({ references: [...draft.references, item] });
    setUrlInput("");
    setLabelInput("");
    setUrlError(null);
    toast.success("链接已加入，创建项目后将进入独立解析队列");
  };

  const removeReference = (localId: string) => {
    patch({ references: draft.references.filter((r) => r.localId !== localId) });
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">参考素材链接</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              链接会进入独立解析队列，依次经过 <strong>① 格式检查 → ② 可访问性 → ③ 使用许可</strong>。
              可访问只代表网络可达，<strong className="text-rose-600">并不等于获得使用授权</strong>。
            </p>
          </div>
          <Badge tone="violet">{draft.references.length} 条待解析</Badge>
        </div>

        <div className="mt-4 grid md:grid-cols-[1fr,220px,auto] gap-3">
          <TextInput
            value={urlInput}
            placeholder="https://example.com/reference.mp4"
            invalid={Boolean(urlError)}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setUrlError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addReference())}
          />
          <TextInput value={labelInput} placeholder="备注（可选）" onChange={(e) => setLabelInput(e.target.value)} />
          <Button variant="secondary" onClick={addReference}>
            添加链接
          </Button>
        </div>
        {urlError && <p className="mt-2 text-xs text-rose-500">{urlError}</p>}

        <ul className="mt-4 space-y-2">
          {draft.references.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
              暂无参考链接。可在创建后、解析进行中随时增删。
            </li>
          )}
          {draft.references.map((ref) => (
            <li key={ref.localId} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
              <span className="text-lg">🔗</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{ref.url}</p>
                {ref.label && <p className="truncate text-xs text-slate-400">{ref.label}</p>}
                <p className="mt-0.5 text-[11px] text-slate-400">创建后入队 · 本地已先行做格式检查</p>
              </div>
              <Badge tone="slate">待解析</Badge>
              <button
                type="button"
                onClick={() => removeReference(ref.localId)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                aria-label="移除链接"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">创作附件</h3>
            <p className="mt-1 text-xs text-slate-500">
              先登记暂存再随创建事务并入项目；离线时仅保留本机记录，状态始终显式可见。
            </p>
          </div>
          <label className="cursor-pointer rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5">
            选择文件
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) onAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <ul className="mt-4 space-y-2">
          {draft.attachments.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
              还没有附件。BGM、Logo、分镜图都可以先传。
            </li>
          )}
          {draft.attachments.map((att) => {
            const meta = formatStatus(att.status);
            return (
              <li key={att.localId} className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg">📎</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{att.fileName}</p>
                    <p className="text-xs text-slate-400">{formatBytes(att.sizeBytes)}</p>
                    {att.note && <p className="mt-0.5 text-xs text-amber-600">{att.note}</p>}
                  </div>
                  <Badge tone={meta.tone}>
                    {meta.text}
                    {att.status === "uploading" && ` ${att.progressPct}%`}
                  </Badge>
                  {att.status === "failed" && att.file && (
                    <Button variant="ghost" onClick={() => onRetryAttachment(att.localId)}>
                      重试
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(att.localId)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                    aria-label="移除附件"
                  >
                    ✕
                  </button>
                </div>
                {(att.status === "uploading" || att.status === "staging_registered") && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
                      style={{ width: `${att.progressPct}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
