# 云溪创作工作室 · CreativeInput 全栈项目创建向导

将创意输入（CreativeInput）升级为**全栈项目创建向导**：React 三步表单收集内容类型、受众、时长与画幅；
后端以**可序列化数据库事务**完成草稿身份、权限校验、项目与解析队列的原子初始化；参考素材进入
**独立解析 Worker 队列**，并严格区分「格式校验 / 可访问 / 已获授权」三种状态。

## 🛠 技术栈
- Frontend: React 18 + TypeScript 5 + Vite 5 + Tailwind CSS + Zustand + React Router + Zod
- Backend: Node.js 20 + Fastify 4 + Prisma 5 + Zod（TypeScript，Pino 结构化日志）
- Worker: 独立容器的解析队列消费者（PostgreSQL 队列表 + `FOR UPDATE SKIP LOCKED` 原子认领）
- Database: PostgreSQL 16
- Infra: Docker Compose（db / backend / worker / frontend 四服务，Volume 持久化）

## 🚀 启动指南 (How to Run)
1. 确保 Docker Desktop（或 Docker Engine）已启动。
2. 在仓库根目录执行：
   ```bash
   docker compose up --build
   ```
3. 等待 `backend` 容器完成 `prisma db push` 与自动 Seed（日志可见 `[seed] done`）。

## 🔗 服务地址 (Services)
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000 （健康检查 http://localhost:8000/health ）
- Database: localhost:5432 （user: studio / pass: studio / db: studio）

## 🧪 测试账号
| 账号 | 密码 | 角色 | 说明 |
| --- | --- | --- | --- |
| admin | 123456 | 管理员 | 含「验收控制台」：一键收回/恢复创建权限、显式授予链接许可 |
| creator | 123456 | 创作者 | 预置 1 个示例项目（含四种链接/附件状态） |
| guest | 123456 | 待授权访客 | 无创建授权，提交创建将收到 403 |

## 🗺️ 页面导览
- `/studio/login` 登录
- `/studio` 我的项目列表
- `/studio/new` **全栈创建向导**（创意设定 → 素材与附件 → 权限与创建）
- `/studio/projects/:id` 项目详情（链接三态轮询、解析期间换链接、附件状态、冻结摘要）
- `/studio/projects/:id/script` **冻结脚本页**（仅创建者可见，只读）
- `/studio/strategy` 「本地先写 vs 服务器先建草稿」取舍与实现说明
- `/`、`/audiovisual`、`/timeline` 原有公园介绍页（接口已由后端真实提供）

## 🔑 核心设计：草稿身份与创建幂等

**身份**：首次打开向导时，客户端生成 `clientRequestId`（UUID）并随草稿持久化到
`localStorage`。多标签页共享同一份本地草稿（BroadcastChannel 会提示同身份编辑）；
离线重连后仍携带同一请求号。

**幂等条件**（`DraftRequest(clientRequestId UNIQUE, payloadHash, projectId)`）：

| 情况 | 判定 | 结果 |
| --- | --- | --- |
| 同请求号 + 同内容哈希 | 幂等命中 | **200 恢复原项目**（`recovered: true`），不产生副本 |
| 同请求号 + 不同内容哈希 | 冲突 | **409 IDEMPOTENCY_CONFLICT**，拒绝覆盖，返回双端哈希 |
| 新请求号 | 正常创建 | 201 |

- `payloadHash = sha256(规范化 JSON)`：键排序、trim、列表排序——任意标签页序列化同一意图结果一致。
- 创建逻辑在单个 **Serializable 事务**中完成：请求号占位 → 权限二次校验 →
  项目/参考链接/附件/解析任务批量初始化 → 权限留痕 → 幂等记录落盘。
- 双标签页**同时**提交：唯一约束 + 事务重试路径保证三个并发请求只建一个项目。
- **成功响应丢失**（断网、页面崩溃）：重发同一请求号即恢复原项目，而非生成副本。
- 409 后用户可在界面上「生成新请求号」把当前内容作为全新草稿提交；旧项目不受影响。

## 🧱 本地先写 vs 服务器先建草稿（已实现本地先写）

| 维度 | 本地先写（采用） | 服务器先建草稿（对照） |
| --- | --- | --- |
| 离线体验 | 编辑/暂存完全离线可用，恢复后同请求号自动重试 | 必须额外实现本地操作日志+回放，等于先做一遍方案 A |
| 隐私 | 未提交创意不离开设备，服务器无“试一半”垃圾草稿 | 每次击键持续上传，需要 TTL/遗弃草稿 GC 与合规成本 |
| 版本合并 | 以“请求号+内容哈希”把分叉显式化为 409，不静默合并 | 可用版本号/OT 合并，但创作决策（画幅/时长）无安全自动合并值 |

落地：本地 400ms 防抖自动保存；浏览器配额用 `navigator.storage.estimate()` 预检；
「清除本机草稿」只删 `localStorage`，**绝不**调用服务器删除接口；导航返回/刷新后可恢复编辑。
完整论述见应用内 `/studio/strategy`。

## 🔗 参考链接三态：格式 ≠ 可访问 ≠ 已授权

解析 Worker 对每条链接独立产出三类状态：
1. **格式检查**（`formatValid`）：纯本地 URL 解析，不发网络请求；
2. **可访问性**（`reachability`）：8 秒超时的真实 HTTP 探测（沙箱可用 `?sim=reachable|unreachable` 模拟）；
3. **使用许可**（`license`）：**HTTP 请求成功绝不构成授权**。默认 `unlicensed/unknown`，
   仅当素材方在链接中携带许可声明（`?license=cc0|cc-by|cc-by-sa|public-domain`）或管理员
   在审核台显式授权时才变为 `licensed`。

- 队列载体为 PostgreSQL（`ParseJob` 表），Worker 用
  `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING` **原子认领**，
  可水平扩多副本，无 Redis 依赖。
- 解析期间用户增删链接：新链接立即入队；删除旧链接其任务级联取消。

## 📎 附件状态机（验收点）
附件三阶段：`POST /api/staging` 登记 → `PUT /api/staging/:id/content` 流式上传（XHR 进度）
→ 创建事务并入项目。显式状态：`uploading（带进度）/ uploaded / pending_local（本机处理中或离线保留）
/ quota_exceeded（浏览器配额不足）/ failed`。项目页与脚本页对未完成附件均有明确提示，不静默丢失。

## ✅ 已验收的关键场景
后端目录内置端到端脚本（需后端 + 数据库运行）：
```bash
cd backend && npm install && node e2e-check.mjs
```
覆盖（24 项全部通过）：登录鉴权、Zod 校验、无权限 403、首次 201、**响应丢失重放恢复**、
**同号异体 409**、空白规范化、异步三态解析、可访问≠授权、解析中换链接、显式授权、
非所有者 404、冻结快照、配额不足/上传中附件、**创建时权限被收回整笔回滚无残稿**、
三请求并发只建一个项目等。

前端建议手工验收：
1. 打开两个标签页同时进入 `/studio/new` → 出现同草稿提示，两边都提交只有一个项目；
2. 提交瞬间断网 → 「离线排队」横幅，恢复后自动恢复/创建；
3. creator 登录，管理员在向导第三步「收回创建权限」后提交 → 403，回滚不留项目；
4. 添加链接 `https://example.com/a?sim=reachable` 与 `...?sim=unreachable`，观察三列状态；
5. 选择一个大附件或在配额紧张环境添加文件 → 「浏览器配额不足」徽章；
6. 创建后立即返回上一步再进入 `/studio/new` → 草稿仍在；点「清除本机草稿」后
   `/studio` 中服务器项目依然存在。

## 🐳 容器说明
- 镜像基于 `node:20-alpine`（构建）与 `nginx:alpine`（前端托管），npm 使用淘宝源加速。
- `backend` 启动时等待数据库就绪 → `prisma db push` 同步表结构 → 执行 Seed → 启动 API；
  `worker` 复用同一镜像以 `ROLE=worker` 运行。
- 上传文件经命名卷 `studio-uploads` 持久化；数据库经 `studio-pgdata` 持久化。
