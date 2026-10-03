import type { AttachmentDTO, ReferenceLinkDTO } from "@/types/studio";
import { Badge } from "./ui";

/**
 * 参考链接三态独立展示：
 * 格式检查（本地） / 可访问性（网络可达） / 使用许可（版权授权）
 * 可访问 ≠ 已授权，两列分别给出颜色与文案。
 */
export function ReferenceStatus({ reference }: { reference: ReferenceLinkDTO }) {
  const parsing = reference.status !== "done";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {reference.formatValid ? (
        <Badge tone="blue">① 格式合格</Badge>
      ) : (
        <Badge tone="rose">① 格式错误</Badge>
      )}
      {parsing ? (
        <Badge tone="amber">② 可访问性检测中…</Badge>
      ) : reference.reachability === "reachable" ? (
        <Badge tone="green">② 可以访问</Badge>
      ) : (
        <Badge tone="rose">② 无法访问{reference.jobs[0]?.lastError ? `（${reference.jobs[0].lastError}）` : ""}</Badge>
      )}
      {parsing ? (
        <Badge tone="amber">③ 许可核验中…</Badge>
      ) : reference.license === "licensed" ? (
        <Badge tone="green">③ 已获使用授权</Badge>
      ) : reference.license === "unlicensed" ? (
        <Badge tone="rose">③ 未获得授权</Badge>
      ) : (
        <Badge tone="slate">③ 许可未知</Badge>
      )}
    </div>
  );
}

export function AttachmentStatus({ status, progressPct, failureNote }: Pick<AttachmentDTO, "status" | "progressPct" | "failureNote">) {
  switch (status) {
    case "uploaded":
      return <Badge tone="green">已上传完成</Badge>;
    case "uploading":
      return (
        <span className="inline-flex items-center gap-2">
          <Badge tone="blue">上传中 {progressPct}%</Badge>
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${progressPct}%` }} />
          </span>
        </span>
      );
    case "pending_local":
      return <Badge tone="amber">仍在本机处理（未上传）</Badge>;
    case "quota_exceeded":
      return <Badge tone="rose">浏览器配额不足</Badge>;
    case "failed":
      return <Badge tone="rose">上传失败{failureNote ? `：${failureNote}` : ""}</Badge>;
    default:
      return <Badge tone="slate">{status}</Badge>;
  }
}
