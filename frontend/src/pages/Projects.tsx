import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects, ProjectSummary } from "@/api/studio";
import Skeleton from "@/components/Skeleton";

const TYPE_LABELS: Record<string, string> = {
  promo: "宣传片",
  documentary: "微纪录片",
  short: "短视频",
  event: "活动记录"
};

const Projects = () => {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">我的项目</h1>
          <p className="mt-1 text-sm text-slate-500">每个项目由草稿幂等转化而来，脚本摘要在创建时冻结</p>
        </div>
        <Link
          to="/create"
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-card transition hover:bg-primary/90 active:scale-[0.99]"
        >
          ＋ 新建项目
        </Link>
      </div>

      <div className="mt-6">
        {projects === null && !error && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-600">
            项目列表加载失败，请检查网络后刷新
          </div>
        )}
        {projects?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-16 text-center">
            <p className="text-4xl">🎬</p>
            <p className="mt-3 text-sm text-slate-500">还没有项目，从创建向导开始你的第一条园区影片吧</p>
            <Link to="/create" className="mt-4 inline-block rounded-xl bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary/90">
              去创建
            </Link>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects?.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}/script`}
              className="group rounded-2xl border border-white bg-white/80 p-5 shadow-card backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {TYPE_LABELS[p.contentType] ?? p.contentType}
                </span>
                <span className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</span>
              </div>
              <h3 className="mt-3 line-clamp-2 font-semibold text-slate-900 group-hover:text-primary transition">{p.title}</h3>
              <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                <span>⏱ {p.durationSec}s</span>
                <span>🖼 {p.aspectRatio}</span>
                <span>🔗 {p.materialCount} 链接</span>
                <span>📎 {p.attachmentCount} 附件</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Projects;
