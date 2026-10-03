import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ASPECT_RATIOS, AUDIENCES, CONTENT_TYPES, type WizardDraft } from "@/types/studio";
import type { SubmitState } from "./useWizard";
import { Badge, Button, Card, Spinner } from "@/components/studio/ui";
import { studioApi } from "@/api/studio";
import { useAuthStore } from "@/store/authStore";
import { hashPayload } from "@/lib/canonical";

const labelOf = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((item) => item.value === value)?.label ?? value;

export default function StepReview({
  draft,
  submit,
  online,
  canSubmit,
  onSubmit,
  onRotateId
}: {
  draft: WizardDraft;
  submit: SubmitState;
  online: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onRotateId: () => void;
}) {
  const navigate = useNavigate();
  const { user, canCreateProject, setPermission } = useAuthStore();
  const [localHash, setLocalHash] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hashPayload({
      title: draft.title,
      contentType: draft.contentType,
      audience: draft.audience,
      durationSec: draft.durationSec,
      aspectRatio: draft.aspectRatio,
      brief: draft.brief,
      references: draft.references.map((r) => ({ url: r.url, label: r.label })),
      attachments: draft.attachments.map((a) => ({ fileName: a.fileName, sizeBytes: a.sizeBytes }))
    }).then(setLocalHash);
  }, [draft]);

  useEffect(() => {
    if (submit.kind === "created" || submit.kind === "recovered") {
      const t = window.setTimeout(() => navigate(`/studio/projects/${submit.projectId}`), 900);
      return () => window.clearTimeout(t);
    }
  }, [submit, navigate]);

  const refreshPermission = async () => {
    setBusy(true);
    try {
      const { data } = await studioApi.me();
      setPermission(data.permissions.canCreateProject);
    } finally {
      setBusy(false);
    }
  };

  const unfinished = draft.attachments.filter((a) => a.status !== "uploaded" && a.status !== "quota_exceeded");
  const quotaBlocked = draft.attachments.filter((a) => a.status === "quota_exceeded");

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="text-sm font-semibold text-slate-800">创建前确认</h3>
        <div className="mt-4 grid md:grid-cols-2 gap-3 text-sm">
          <InfoRow label="作品标题" value={draft.title || "—"} />
          <InfoRow label="内容类型" value={labelOf(CONTENT_TYPES, draft.contentType)} />
          <InfoRow label="目标受众" value={labelOf(AUDIENCES, draft.audience)} />
          <InfoRow label="画幅" value={labelOf(ASPECT_RATIOS, draft.aspectRatio)} />
          <InfoRow label="时长" value={`${draft.durationSec} 秒`} />
          <InfoRow label="参考链接" value={`${draft.references.length} 条（创建后入独立队列）`} />
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 break-all">
          <span className="font-semibold text-slate-700">草稿身份 clientRequestId：</span>
          <span className="font-mono">{draft.clientRequestId}</span>
          <div className="mt-1">
            <span className="font-semibold text-slate-700">内容哈希 payloadHash：</span>
            <span className="font-mono">{localHash.slice(0, 16)}…{localHash.slice(-8)}</span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">创建权限</h3>
            <p className="mt-1 text-xs text-slate-500">
              权限在服务器端创建事务内部二次校验：若授权此刻被收回，项目与草稿都不会落库（整笔回滚）。
            </p>
          </div>
          {canCreateProject ? (
            <Badge tone="green">✓ 已授权 project:create</Badge>
          ) : (
            <Badge tone="rose">✗ 缺少有效创建授权</Badge>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
          <span>当前账号：{user?.username}</span>
          <Button variant="ghost" onClick={() => void refreshPermission()} disabled={busy}>
            {busy ? <Spinner /> : "↻"} 重新检查权限
          </Button>
        </div>
        {user?.role === "admin" && <AdminPermPanel targetUsername={user.username === "admin" ? "creator" : user.username} />}
      </Card>

      {unfinished.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>{unfinished.length} 个附件尚未上传完成</strong>，它们将以「本机处理中 / 离线保留」状态进入项目，
          可在项目页继续追踪，不会阻塞创建。
        </div>
      )}
      {quotaBlocked.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <strong>{quotaBlocked.length} 个附件因浏览器配额不足未能暂存</strong>，清理空间后可移除重传。
        </div>
      )}

      {submit.kind === "conflict" && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-5">
          <h4 className="text-sm font-bold text-rose-800">请求号冲突（409）</h4>
          <p className="mt-2 text-sm text-rose-700 leading-relaxed">
            这个 clientRequestId 已经对应服务器上另一份内容。为避免覆盖既有项目，本次创建被拒绝。
            你可以：生成<strong>新请求号</strong>把当前内容作为全新草稿提交；原项目保持不变。
          </p>
          <div className="mt-3 grid gap-1 text-[11px] font-mono text-rose-500 break-all">
            <span>服务器内容哈希：{submit.existingHash}</span>
            <span>本次内容哈希：{submit.incomingHash ?? localHash}</span>
          </div>
          <div className="mt-4 flex gap-3">
            <Button onClick={onRotateId}>生成新请求号继续</Button>
            {draft.committedProjectId && (
              <Button variant="secondary" onClick={() => navigate(`/studio/projects/${draft.committedProjectId}`)}>
                查看原项目
              </Button>
            )}
          </div>
        </div>
      )}

      {submit.kind === "forbidden" && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-5">
          <h4 className="text-sm font-bold text-rose-800">创建被拒绝（403）</h4>
          <p className="mt-2 text-sm text-rose-700">{submit.message}</p>
          <p className="mt-1 text-xs text-rose-500">错误码：{submit.code}。请管理员恢复授权后重试（请求号不变，不会产生重复项目）。</p>
        </div>
      )}

      {submit.kind === "offline-queued" && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-800">
          当前离线：草稿已在本机排队并保留请求号。网络恢复后会自动重试——服务器若已创建过，则直接恢复原项目。
        </div>
      )}

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/90 p-4 shadow-card backdrop-blur">
        <div className="text-xs text-slate-500">
          {online ? <span className="text-emerald-600">● 在线</span> : <span className="text-amber-600">● 离线（本机先写）</span>}
          {" · "}内容自动保存于本机，返回页面可继续编辑；清除本机草稿不影响服务器项目。
        </div>
        <div className="flex items-center gap-3">
          {(submit.kind === "created" || submit.kind === "recovered") && <Badge tone="green">已进入项目…</Badge>}
          <Button
            onClick={onSubmit}
            disabled={!canSubmit || submit.kind === "submitting" || submit.kind === "created" || submit.kind === "recovered"}
          >
            {submit.kind === "submitting" ? (
              <>
                <Spinner /> 正在提交事务…
              </>
            ) : (
              "幂等创建项目"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 font-medium text-slate-800">{value}</p>
    </div>
  );
}

/** 验收辅助：管理员一键收回/恢复 creator 的创建权限，演示“创建时权限被收回” */
function AdminPermPanel({ targetUsername }: { targetUsername: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-3">
      <p className="text-xs font-semibold text-slate-600">🛠️ 验收控制台（仅管理员可见）· 目标账号 {targetUsername}</p>
      <div className="mt-2 flex gap-2">
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await studioApi.adminRevoke(targetUsername);
            } finally {
              setBusy(false);
            }
          }}
        >
          收回创建权限
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await studioApi.adminRestore(targetUsername);
            } finally {
              setBusy(false);
            }
          }}
        >
          恢复创建权限
        </Button>
      </div>
    </div>
  );
}
