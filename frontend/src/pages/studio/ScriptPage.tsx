import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ProjectDTO } from "@/types/studio";
import { studioApi } from "@/api/studio";
import { Badge, Button, Card, Spinner } from "@/components/studio/ui";
import { ASPECT_RATIOS, AUDIENCES, CONTENT_TYPES } from "@/types/studio";

const labelOf = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((item) => item.value === value)?.label ?? value;

/**
 * 脚本页：只能展示“所创建项目”的冻结摘要。
 * - 非所有者 -> 404（不泄露存在性）
 * - 内容取自 project.snapshot（创建瞬间定格），不随后续链接修改而变化
 * - 页面内没有任何编辑入口
 */
export default function ScriptPage() {
  const { id = "" } = useParams();
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    studioApi
      .getProject(id)
      .then(({ data }) => alive && setProject(data))
      .catch((err) => {
        if (alive && err?.response?.status === 404) setDenied(true);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (denied) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="text-4xl">🔒</div>
        <h2 className="mt-3 text-xl font-bold text-slate-900">脚本页只对项目创建者开放</h2>
        <p className="mt-2 text-sm text-slate-500">你不能查看他人所创建项目的冻结摘要。</p>
        <Link to="/studio" className="mt-5 inline-block">
          <Button>返回项目列表</Button>
        </Link>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-slate-400">
        <Spinner /> 正在取出冻结脚本…
      </div>
    );
  }

  const snap = project.snapshot;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to={`/studio/projects/${project.id}`} className="text-sm font-medium text-primary hover:underline">
            ← 返回项目
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{snap.title}</h1>
          <p className="mt-1 text-sm text-slate-500">冻结脚本 · 只读</p>
        </div>
        <Badge tone="slate">定格于 {new Date(snap.frozenAt).toLocaleString("zh-CN")}</Badge>
      </div>

      <Card className="bg-gradient-to-br from-primary/5 to-white">
        <div className="flex flex-wrap gap-2">
          <Badge tone="blue">{labelOf(CONTENT_TYPES, snap.contentType)}</Badge>
          <Badge tone="violet">{labelOf(AUDIENCES, snap.audience)}</Badge>
          <Badge tone="slate">{snap.durationSec} 秒</Badge>
          <Badge tone="slate">{labelOf(ASPECT_RATIOS, snap.aspectRatio)}</Badge>
          <Badge tone="slate">参考 {snap.referenceUrls.length} 条</Badge>
          <Badge tone="slate">附件 {snap.attachmentCount} 个</Badge>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-800">📜 冻结分镜脚本</h3>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-white p-5 text-sm leading-7 text-slate-700">
          {snap.script}
        </pre>
        <p className="mt-3 text-xs text-slate-400">
          该文本在项目创建事务中生成并写入快照。即使之后增删参考链接或附件，脚本页始终展示本版本。
        </p>
      </Card>

      {snap.referenceUrls.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-800">创建时引用的链接（快照）</h3>
          <ul className="mt-3 space-y-1.5">
            {snap.referenceUrls.map((url, index) => (
              <li key={index} className="break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 font-mono">
                {url}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-center text-xs text-slate-400">
        本页为只读视图，没有编辑控件。需要调整请返回项目页更换参考链接（不影响本冻结脚本），或创建新项目。
      </div>
    </div>
  );
}
