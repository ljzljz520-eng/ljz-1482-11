import { ChangeEvent, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useWizardStore } from "@/store/wizardStore";
import { useUploadStore } from "@/store/uploadStore";
import { Pill, FieldLabel, formatBytes } from "./components";

/** 客户端第 1 级格式预检（服务端仍会独立复核） */
function clientFormatCheck(url: string): { ok: boolean; reason?: string } {
  const u = url.trim();
  if (!u) return { ok: false, reason: "链接不能为空" };
  if (/\s/.test(u)) return { ok: false, reason: "不能包含空白字符" };
  try {
    const p = new URL(u);
    if (p.protocol !== "http:" && p.protocol !== "https:") return { ok: false, reason: "仅支持 http/https" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "URL 格式不合法" };
  }
}

const StepMaterials = () => {
  const draftId = useWizardStore((s) => s.draftId);
  const materials = useWizardStore((s) => s.materials);
  const addMaterial = useWizardStore((s) => s.addMaterial);
  const updateMaterial = useWizardStore((s) => s.updateMaterial);
  const removeMaterial = useWizardStore((s) => s.removeMaterial);
  const quotaDegraded = useWizardStore((s) => s.quotaDegraded);
  const uploadItems = useUploadStore((s) => s.items);
  const uploads = useMemo(() => Object.values(uploadItems).filter((i) => i.draftId === draftId), [uploadItems, draftId]);
  const addFiles = useUploadStore((s) => s.addFiles);
  const retryUpload = useUploadStore((s) => s.retry);
  const removeUpload = useUploadStore((s) => s.remove);

  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const onAdd = () => {
    const url = urlInput.trim();
    if (!url) return;
    if (materials.length >= 20) {
      toast.error("参考链接最多 20 条");
      return;
    }
    if (materials.some((m) => m.url.trim() === url)) {
      toast.error("该链接已添加");
      return;
    }
    addMaterial(url);
    setUrlInput("");
    const check = clientFormatCheck(url);
    if (!check.ok) toast.error(`格式预检未通过：${check.reason}（仍可保存，创建时将标记为无效）`);
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void addFiles(draftId, files);
    e.target.value = "";
  };

  return (
    <div className="space-y-8">
      {quotaDegraded && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ 浏览器存储配额不足：草稿与附件暂存已降级为内存模式，请勿刷新或关闭页面；内容将直接同步到服务器。
        </div>
      )}

      <section>
        <FieldLabel hint="创建后进入独立解析队列：格式 → 可访问性 → 使用许可 三级校验">
          参考素材链接（{materials.length}/20）
        </FieldLabel>
        <div className="flex gap-2">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAdd())}
            placeholder="https://example.com/reference-video"
            className="flex-1 rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={onAdd}
            className="rounded-xl bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary/90 active:scale-[0.98]"
          >
            添加
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {materials.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
              还没有参考链接。添加后将在创建时进入异步解析队列。
            </p>
          )}
          {materials.map((m) => {
            const check = clientFormatCheck(m.url);
            return (
              <div key={m.id} className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800">{m.url}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {check.ok ? <Pill tone="ok">格式 ✓</Pill> : <Pill tone="bad">格式 ✗ {check.reason}</Pill>}
                      <Pill tone="muted" title="创建后由解析队列检查">可访问性 · 待解析</Pill>
                      <Pill tone={m.userAttested ? "ok" : "warn"} title="HTTP 可访问不代表已获授权">
                        许可 · {m.userAttested ? "已声明授权" : "未核验"}
                      </Pill>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMaterial(m.id)}
                    className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    移除
                  </button>
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={m.userAttested}
                    onChange={(e) => updateMaterial(m.id, { userAttested: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary/30"
                  />
                  我拥有该素材的使用权或已获得授权（许可声明将作为证据记录）
                </label>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
          说明：链接「可访问」仅代表资源存在，<b>不代表已获得使用许可</b>。许可状态需通过授权声明或许可证据确认。
        </p>
      </section>

      <section>
        <FieldLabel hint="视频 / 音频 / 图片 / PDF，单个不超过 50MB">附件素材（{uploads.length}）</FieldLabel>
        <input ref={fileRef} type="file" multiple accept="video/*,audio/*,image/*,application/pdf" className="hidden" onChange={onPickFiles} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-white/60 px-4 py-6 text-sm text-slate-500 transition hover:border-primary/50 hover:text-primary"
        >
          📎 点击选择文件（断网/刷新后可从未完成状态恢复上传）
        </button>
        <div className="mt-3 space-y-2">
          {uploads.map((u) => (
            <div key={u.localId} className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800">{u.fileName}</p>
                  <p className="text-xs text-slate-400">{formatBytes(u.sizeBytes)}</p>
                </div>
                {u.status === "uploaded" && <Pill tone="ok">已上传</Pill>}
                {(u.status === "uploading" || u.status === "registering") && <Pill tone="info">上传中 {u.progress}%</Pill>}
                {u.status === "queued" && <Pill tone="muted">排队中</Pill>}
                {u.status === "failed" && <Pill tone="bad">失败</Pill>}
                {!u.persisted && u.status !== "uploaded" && (
                  <Pill tone="warn" title="配额不足，未写入本地暂存">未暂存</Pill>
                )}
                {u.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => void retryUpload(u.localId)}
                    className="rounded-lg px-2 py-1 text-xs text-primary transition hover:bg-primary/10"
                  >
                    重试
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void removeUpload(u.localId)}
                  className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  移除
                </button>
              </div>
              {(u.status === "uploading" || u.status === "registering") && (
                <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${u.progress}%` }} />
                </div>
              )}
              {u.status === "failed" && <p className="mt-1 text-xs text-rose-600">{u.error}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default StepMaterials;
