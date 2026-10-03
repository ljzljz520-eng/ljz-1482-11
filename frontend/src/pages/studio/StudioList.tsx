import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ASPECT_RATIOS, AUDIENCES, CONTENT_TYPES, type ProjectListItem } from "@/types/studio";
import { studioApi } from "@/api/studio";
import { Badge, Button, Card, Spinner } from "@/components/studio/ui";

const labelOf = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((item) => item.value === value)?.label ?? value;

export default function StudioList() {
  const [items, setItems] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    studioApi
      .listProjects()
      .then(({ data }) => alive && setItems(data.items))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Creative Studio</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">我的创作项目</h1>
          <p className="mt-1 text-sm text-slate-500">项目由事务化初始化生成；脚本页展示创建瞬间冻结的摘要。</p>
        </div>
        <Link to="/studio/new">
          <Button>+ 新建创作项目</Button>
        </Link>
      </div>

      {error && (
        <Card className="border-rose-200 bg-rose-50 text-sm text-rose-700">
          项目列表加载失败，请确认后端服务可用后刷新页面。
        </Card>
      )}

      {!items && !error && (
        <div className="grid md:grid-cols-2 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="space-y-3">
              <div className="h-5 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            </Card>
          ))}
          <div className="flex items-center gap-2 text-sm text-slate-400 md:col-span-2">
            <Spinner /> 正在加载项目…
          </div>
        </div>
      )}

      {items && items.length === 0 && (
        <Card className="py-14 text-center">
          <div className="text-4xl">🎞️</div>
          <h3 className="mt-3 text-lg font-semibold text-slate-800">还没有创作项目</h3>
          <p className="mt-1 text-sm text-slate-500">从内容类型、受众、时长与画幅开始，向导会自动在本机保存草稿。</p>
          <Link to="/studio/new" className="mt-5 inline-block">
            <Button>开始第一个项目</Button>
          </Link>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {items?.map((project) => (
          <Link
            key={project.id}
            to={`/studio/projects/${project.id}`}
            className="group rounded-2xl border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur transition-all hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-slate-900 group-hover:text-primary">{project.title}</h3>
              <Badge tone="blue">{labelOf(CONTENT_TYPES, project.contentType)}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2.5 py-1">{labelOf(AUDIENCES, project.audience)}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1">{labelOf(ASPECT_RATIOS, project.aspectRatio)}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1">{project.durationSec} 秒</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {project.pendingReferences > 0 ? (
                <Badge tone="amber">{project.pendingReferences} 条参考解析中</Badge>
              ) : (
                <Badge tone="slate">{project.referenceCount} 条参考</Badge>
              )}
              {project.unfinishedAttachments > 0 && <Badge tone="amber">{project.unfinishedAttachments} 个附件未完成</Badge>}
            </div>
            <p className="mt-3 text-xs text-slate-400">创建于 {new Date(project.createdAt).toLocaleString("zh-CN")}</p>
          </Link>
        ))}
      </div>

      <div className="flex justify-center">
        <Link to="/studio/strategy" className="text-sm font-medium text-primary hover:underline">
          查看本地先写 vs 服务器先建草稿的取舍说明 →
        </Link>
      </div>
    </div>
  );
}
