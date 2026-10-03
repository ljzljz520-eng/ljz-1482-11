import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import type { ProjectDTO } from "@/types/studio";
import { studioApi } from "@/api/studio";
import { AttachmentStatus, ReferenceStatus } from "@/components/studio/StatusBadges";
import { Badge, Button, Card, Spinner, TextInput } from "@/components/studio/ui";
import { formatBytes } from "@/utils/format";
import { validateReferenceUrl } from "@/lib/wizardSchema";
import { ASPECT_RATIOS, AUDIENCES, CONTENT_TYPES } from "@/types/studio";

const labelOf = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((item) => item.value === value)?.label ?? value;

export default function ProjectDetail() {
  const { id = "" } = useParams();
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [savingRef, setSavingRef] = useState(false);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(
    async (silent = false) => {
      try {
        const { data } = await studioApi.getProject(id);
        setProject(data);
        setNotFound(false);
        return data;
      } catch {
        if (!silent) setNotFound(true);
        return null;
      }
    },
    [id]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  // 解析进行中：轮询直到全部链接 done；附件仍在上传时同样保持刷新
  useEffect(() => {
    if (!project) return;
    const pendingRefs = project.references.some((r) => r.status !== "done");
    const pendingAtts = project.attachments.some((a) => a.status === "uploading" || a.status === "pending_local");
    if (pendingRefs || pendingAtts) {
      timerRef.current = window.setTimeout(() => void load(true), 2000);
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [project, load]);

  const addReference = async () => {
    const error = validateReferenceUrl(newUrl.trim());
    if (error) {
      setUrlError(error);
      return;
    }
    setSavingRef(true);
    try {
      const { data } = await studioApi.addReference(id, newUrl.trim(), newLabel.trim());
      setProject(data.project);
      setNewUrl("");
      setNewLabel("");
      setUrlError(null);
      toast.success("新链接已入解析队列，旧链接的解析不受影响");
    } catch {
      /* toast 由拦截器统一处理 */
    } finally {
      setSavingRef(false);
    }
  };

  const removeReference = async (refId: string) => {
    try {
      const { data } = await studioApi.removeReference(id, refId);
      setProject(data.project);
      toast.success("链接已移除，其解析任务已取消");
    } catch {
      /* noop */
    }
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="text-4xl">🚫</div>
        <h2 className="mt-3 text-xl font-bold text-slate-900">项目不存在或无权查看</h2>
        <p className="mt-2 text-sm text-slate-500">脚本页只展示你自己创建的项目的冻结摘要。</p>
        <Link to="/studio" className="mt-5 inline-block">
          <Button>返回项目列表</Button>
        </Link>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-slate-400">
        <Spinner /> 正在载入项目…
      </div>
    );
  }

  const parsing = project.references.some((r) => r.status !== "done");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/studio" className="text-sm font-medium text-primary hover:underline">
            ← 我的项目
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{project.title}</h1>
          <p className="mt-1 text-xs text-slate-400">
            项目 {project.id} · 创建于 {new Date(project.createdAt).toLocaleString("zh-CN")}
            {project.draftRequest && <> · 请求号 {project.draftRequest.clientRequestId}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {project.permissionState.revoked ? (
            <Badge tone="rose">创建权限已收回（项目已存在，不受影响）</Badge>
          ) : (
            <Badge tone="green">创建权限有效</Badge>
          )}
          <Link to={`/studio/projects/${project.id}/script`}>
            <Button variant="secondary">📜 查看冻结脚本</Button>
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <SummaryStat label="内容类型" value={labelOf(CONTENT_TYPES, project.contentType)} />
        <SummaryStat label="目标受众" value={labelOf(AUDIENCES, project.audience)} />
        <SummaryStat label="时长" value={`${project.durationSec} 秒`} />
        <SummaryStat label="画幅" value={labelOf(ASPECT_RATIOS, project.aspectRatio)} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">参考素材解析队列</h3>
            <p className="mt-1 text-xs text-slate-500">
              解析异步进行：可随时更换链接。格式 / 可访问 / 授权<strong>三层状态互相独立</strong>。
            </p>
          </div>
          {parsing ? (
            <Badge tone="amber">
              <Spinner className="h-3 w-3" /> 解析进行中…
            </Badge>
          ) : (
            <Badge tone="green">解析已完成</Badge>
          )}
        </div>

        <div className="mt-4 grid md:grid-cols-[1fr,200px,auto] gap-3">
          <TextInput
            value={newUrl}
            placeholder="异步解析期间也可以粘贴新链接"
            invalid={Boolean(urlError)}
            onChange={(e) => {
              setNewUrl(e.target.value);
              setUrlError(null);
            }}
          />
          <TextInput value={newLabel} placeholder="备注（可选）" onChange={(e) => setNewLabel(e.target.value)} />
          <Button variant="secondary" onClick={() => void addReference()} disabled={savingRef}>
            {savingRef ? <Spinner /> : "更换/追加链接"}
          </Button>
        </div>
        {urlError && <p className="mt-2 text-xs text-rose-500">{urlError}</p>}

        <ul className="mt-4 space-y-3">
          {project.references.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
              暂无参考链接
            </li>
          )}
          {project.references.map((ref) => (
            <li key={ref.id} className="rounded-xl border border-slate-100 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">🔗</span>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium text-slate-800">{ref.url}</p>
                  {ref.label && <p className="text-xs text-slate-400">{ref.label}</p>}
                  <div className="mt-2">
                    <ReferenceStatus reference={ref} />
                  </div>
                  {ref.license === "unlicensed" && (
                    <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      ⚠️ 服务器能访问该资源，但<strong>没有</strong>取得使用授权——请勿直接商用。
                      可在素材平台确认开放许可（如链接携带 license 参数），或由管理员在审核台显式授权。
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void removeReference(ref.id)}
                  className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                >
                  移除
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-800">附件状态</h3>
        <p className="mt-1 text-xs text-slate-500">未完成附件在此明确展示，不会静默丢失。</p>
        <ul className="mt-4 space-y-3">
          {project.attachments.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
              本项目没有附件
            </li>
          )}
          {project.attachments.map((att) => (
            <li key={att.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
              <span className="text-lg">📎</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{att.fileName}</p>
                <p className="text-xs text-slate-400">
                  {formatBytes(att.sizeBytes)}
                  {att.failureNote ? ` · ${att.failureNote}` : ""}
                </p>
              </div>
              <AttachmentStatus status={att.status} progressPct={att.progressPct} failureNote={att.failureNote} />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="bg-slate-50/70">
        <h3 className="text-sm font-semibold text-slate-800">冻结摘要快照</h3>
        <p className="mt-1 text-xs text-slate-500">
          快照定格于 {new Date(project.snapshot.frozenAt).toLocaleString("zh-CN")}，后续改链接不会改写脚本页内容。
        </p>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-4 text-xs leading-relaxed text-slate-600 border border-slate-100">
          {project.frozenScript}
        </pre>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 shadow-card">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}
