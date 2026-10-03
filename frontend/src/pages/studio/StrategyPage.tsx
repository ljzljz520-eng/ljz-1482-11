import { Link } from "react-router-dom";
import { Badge, Card } from "@/components/studio/ui";

export default function StrategyPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Engineering Decision</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">本地先写 vs 服务器先建草稿：取舍与本项目的实现</h1>
        <p className="mt-2 text-sm text-slate-500">
          向导采用 <strong>本地先写（Local-first）</strong>方案，同时保留服务器端幂等创建作为最终一致性的裁决者。
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">方案 A：本地先写（本项目采用）</h2>
            <Badge tone="green">已实现</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            输入先写 localStorage（防抖 400ms），草稿身份 clientRequestId 在首次打开时生成并持久化；
            只有点击“幂等创建”才向服务器发起事务化初始化。
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>✅ <strong>离线体验：</strong>断网可继续编辑、添加链接；提交进入本机队列，恢复网络后用同一请求号自动重试，服务器已建则恢复、未建则创建。</li>
            <li>✅ <strong>隐私：</strong>未提交的创意不离开设备，服务器上不留“试了一半”的垃圾草稿。</li>
            <li>⚠️ <strong>版本合并成本：</strong>两台设备各自离线编辑同一身份的草稿会分叉。本项目以“请求号 + 内容哈希”把分叉显式化为 409 冲突，交给用户换新请求号，而不是静默覆盖；不做字段级三方合并（成本与误判风险高）。</li>
            <li>⚠️ 浏览器配额受限（已用 navigator.storage.estimate() 预检，不足时附件标记 quota_exceeded）。</li>
          </ul>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">方案 B：服务器先建草稿</h2>
            <Badge tone="slate">对照方案</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            进入向导即 POST /drafts，之后每次修改都 PATCH 到服务器，提交时把草稿“转正”为项目。
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>✅ <strong>跨设备一致：</strong>草稿天然在云端，换设备直接继续。</li>
            <li>✅ <strong>版本合并：</strong>可用乐观锁版本号/OT 做并发合并，冲突有统一裁决点。</li>
            <li>❌ <strong>离线体验：</strong>离线必须额外做本地操作日志 + 回放，等价于先实现一遍方案 A 再加同步。</li>
            <li>❌ <strong>隐私：</strong>未成形的想法（标题、备注、浏览痕迹）持续上传；需要 TTL 清理与“遗弃草稿” GC，合规成本高。</li>
            <li>❌ 每次击键都要网络往返（需批量/防抖），弱网下体验差。</li>
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-bold text-slate-900">本项目的混合落地</h2>
        <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="font-semibold text-slate-800">1. 身份在客户端生成</p>
            <p className="mt-1 text-slate-500">crypto.randomUUID() 生成 clientRequestId，随 localStorage 草稿持久化；多标签页通过 BroadcastChannel 感知同一身份。</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="font-semibold text-slate-800">2. 服务器只认真实创建</p>
            <p className="mt-1 text-slate-500">DraftRequest(请求号 唯一, 内容哈希) + Project 在 Serializable 事务里原子写入。同号同体返回原项目；同号异体 409。</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="font-semibold text-slate-800">3. 失败安全语义</p>
            <p className="mt-1 text-slate-500">成功响应丢失后客户端重发同一请求号 → 恢复原项目；权限收回整笔回滚不留残稿；清本机草稿不调用任何删除接口。</p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-slate-900">合并策略为什么不做“自动合并”</h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          画幅 16:9 与 9:16、时长 30s 与 60s 这类创作决策不存在可自动调和的“合并值”；附件列表与参考链接的增删还涉及异步任务的生命周期。
          因此系统选择<strong>不丢数据、不静默覆盖</strong>：用规范化 JSON（键排序 + trim）计算 sha256 内容哈希，
          哈希相同即同一意图（幂等恢复），不同即冲突（409 引导生成新请求号）。这把版本合并成本从“系统猜”转为“用户一次明确选择”。
        </p>
      </Card>

      <div className="flex justify-center">
        <Link to="/studio/new" className="text-sm font-medium text-primary hover:underline">
          回到向导体验完整流程 →
        </Link>
      </div>
    </div>
  );
}
