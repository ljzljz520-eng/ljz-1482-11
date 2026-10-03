import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  getProject,
  updateMaterialUrl,
  attestMaterial,
  ProjectDetail,
  ReferenceMaterial
} from "@/api/studio";
import Skeleton from "@/components/Skeleton";
import { Pill } from "./create/components";
import { formatBytes } from "./create/components";

const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}分${s > 0 ? `${s}秒` : ""}` : `${s}秒`;
};

const REACHABILITY: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }> = {
  unknown: { label: "待检测", tone: "muted" },
  checking: { label: "检测中…", tone: "info" },
  reachable: { label: "可访问", tone: "ok" },
  unreachable: { label: "不可访问", tone: "bad" }
};

const PARSE_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }> = {
  queued: { label: "排队中", tone: "muted" },
  parsing: { label: "解析中…", tone: "info" },
  parsed: { label: "解析完成", tone: "ok" },
  failed: { label: "解析失败", tone: "bad" }
};

function MaterialCard({ material, onChanged }: { material: ReferenceMaterial; onChanged: (m: ReferenceMaterial) => void }) {
  const [editing, setEditing] = useState(false);
  const [urlInput, setUrlInput] = useState(material.url);
  const [saving, setSaving] = useState(false);

  const saveUrl = async () => {
    if (!urlInput.trim() || urlInput.trim() === material.url) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateMaterialUrl(material.id, urlInput.trim());
      onChanged(updated);
      setEditing(false);
      toast.success("链接已更新，旧解析结果作废，已重新排队解析");
    } catch {
      /* 拦截器已提示 */
    } finally {
      setSaving(false);
    }
  };

  const toggleAttest = async () => {
    try {
      const updated = await attestMaterial(material.id, !material.userAttested);
      onChanged(updated);
      toast.success(updated.userAttested ? "已记录授权声明" : "已撤销授权声明");
    } catch {
      /* 拦截器已提示 */
    }
  };

  const reach = REACHABILITY[material.reachability] ?? REACHABILITY.unknown;
  const parse = PARSE_STATUS[material.parseStatus] ?? PARSE_STATUS.queued;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex gap-2">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={saveUrl}
                disabled={saving}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? "保存中…" : "保存"}
              </button>
              <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 transition hover:bg-slate-50">
                取消
              </button>
            </div>
          ) : (
            <p className="break-all text-sm text-slate-800">{material.url}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill tone={material.formatStatus === "valid" ? "ok" : "bad"}>
              格式 {material.formatStatus === "valid" ? "✓" : "✗"}
            </Pill>
            <Pill tone={reach.tone}>可访问性 · {reach.label}</Pill>
            <Pill
              tone={material.licenseStatus === "confirmed" ? "ok" : "warn"}
              title={material.licenseEvidence ?? "HTTP 可访问不代表已获授权"}
            >
              许可 · {material.licenseStatus === "confirmed" ? "已确认" : "未核验"}
            </Pill>
            <Pill tone={parse.tone}>解析 · {parse.label}</Pill>
            <span className="text-xs text-slate-300">v{material.version}</span>
          </div>
          {material.licenseEvidence && <p className="mt-1.5 text-xs text-emerald-700">许可证据：{material.licenseEvidence}</p>}
          {material.parsedMeta && (
            <p className="mt-1 text-xs text-slate-400">
              {material.parsedMeta.httpStatus != null && `HTTP ${material.parsedMeta.httpStatus} · `}
              {material.parsedMeta.contentType && `${material.parsedMeta.contentType} · `}
              {material.parsedMeta.title && `《${material.parsedMeta.title}》 · `}
              {material.parsedMeta.note}
            </p>
          )}
          {material.lastError && <p className="mt-1 text-xs text-rose-600">{material.lastError}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {!editing && (
            <button
              onClick={() => {
                setUrlInput(material.url);
                setEditing(true);
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-primary/50 hover:text-primary"
            >
              修改链接
            </button>
          )}
          <button
            onClick={toggleAttest}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-primary/50 hover:text-primary"
          >
            {material.userAttested ? "撤销授权声明" : "声明已获授权"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ProjectScript = () => {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;
    let stopped = false;
    const load = async (silent: boolean) => {
      try {
        const p = await getProject(id);
        if (stopped) return;
        setProject(p);
        setError(null);
        // 有素材在解析或附件在上传时继续轮询
        const active =
          p.materials.some((m) => m.parseStatus === "queued" || m.parseStatus === "parsing") ||
          p.attachments.some((a) => a.status === "uploading");
        if (!active && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } catch (e) {
        if (!silent) setError("项目加载失败或无权查看");
      }
    };
    void load(false);
    timerRef.current = setInterval(() => void load(true), 3000);
    return () => {
      stopped = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-4xl">😢</p>
        <p className="mt-3 text-sm text-slate-500">{error}</p>
        <Link to="/projects" className="mt-4 inline-block rounded-xl bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary/90">
          返回项目列表
        </Link>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const snap = project.snapshot;
  const unverifiedCount = project.materials.filter((m) => m.licenseStatus !== "confirmed").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{project.title}</h1>
          <p className="mt-1 text-sm text-slate-500">创建于 {new Date(project.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/projects" className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-sm text-slate-600 transition hover:border-primary/50 hover:text-primary">
            ← 项目列表
          </Link>
          <Link to="/create" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90">
            ＋ 新建项目
          </Link>
        </div>
      </div>

      {/* 冻结摘要：只读，创建时生成 */}
      <section className="mt-6 rounded-3xl border border-white bg-white/80 p-6 shadow-card backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">脚本摘要</h2>
          <Pill tone="info" title="项目创建时生成，内容不再随草稿变化">🔒 已冻结 · v{snap.version}</Pill>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
          <div><dt className="text-xs text-slate-400">内容类型</dt><dd className="mt-0.5 font-medium text-slate-800">{snap.contentTypeLabel}</dd></div>
          <div><dt className="text-xs text-slate-400">目标受众</dt><dd className="mt-0.5 font-medium text-slate-800">{snap.audienceLabel}</dd></div>
          <div><dt className="text-xs text-slate-400">时长</dt><dd className="mt-0.5 font-medium text-slate-800">{fmtTime(snap.durationSec)}</dd></div>
          <div><dt className="text-xs text-slate-400">画幅</dt><dd className="mt-0.5 font-medium text-slate-800">{snap.aspectRatio}</dd></div>
        </dl>
        {snap.brief && <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">{snap.brief}</p>}

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-800">分场大纲</h3>
          <div className="mt-2 space-y-2">
            {snap.outline.map((sec) => (
              <div key={sec.key} className="flex gap-4 rounded-xl border border-slate-100 bg-white/70 px-4 py-3">
                <div className="w-24 shrink-0 text-xs font-medium text-primary">
                  {fmtTime(sec.startSec)} – {fmtTime(sec.endSec)}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{sec.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{sec.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {snap.productionNotes.map((n, i) => (
            <span key={i} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">{n}</span>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">冻结于 {new Date(snap.frozenAt).toLocaleString()} · 此页仅展示创建时的摘要，不提供编辑入口</p>
      </section>

      {/* 参考素材：三级校验状态（实时轮询） */}
      <section className="mt-6 rounded-3xl border border-white bg-white/80 p-6 shadow-card backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">参考素材（{project.materials.length}）</h2>
          {unverifiedCount > 0 && (
            <Pill tone="warn" title="可访问 ≠ 已授权">⚠️ {unverifiedCount} 条许可未核验</Pill>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-400">格式 / 可访问性 / 使用许可 三级独立校验；HTTP 请求成功不代表获得授权</p>
        <div className="mt-4 space-y-3">
          {project.materials.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">该项目没有参考链接</p>}
          {project.materials.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              onChanged={(updated) =>
                setProject((p) => (p ? { ...p, materials: p.materials.map((x) => (x.id === updated.id ? updated : x)) } : p))
              }
            />
          ))}
        </div>
      </section>

      {/* 附件：未完成的有明确状态 */}
      <section className="mt-6 rounded-3xl border border-white bg-white/80 p-6 shadow-card backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-slate-900">附件（{project.attachments.length}）</h2>
        <div className="mt-4 space-y-2">
          {project.attachments.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">该项目没有附件</p>}
          {project.attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-800">{a.fileName}</p>
                <p className="text-xs text-slate-400">{a.mimeType} · {formatBytes(a.sizeBytes)}</p>
                {a.error && <p className="mt-0.5 text-xs text-rose-600">{a.error}</p>}
              </div>
              {a.status === "uploaded" && <Pill tone="ok">已上传</Pill>}
              {a.status === "uploading" && <Pill tone="info">上传中…</Pill>}
              {a.status === "failed" && <Pill tone="bad">上传失败</Pill>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ProjectScript;
